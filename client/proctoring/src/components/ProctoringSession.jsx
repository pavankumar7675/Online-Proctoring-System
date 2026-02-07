import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { io } from 'socket.io-client';
import { Play, Pause, RotateCcw, Users, Eye, Activity, Shield } from 'lucide-react';
import StatusIndicator from './StatusIndicator';
import Statistics from './Statistics';
import AlertPanel from './AlertPanel';

const SOCKET_URL = 'http://localhost:5000';

const ProctoringSession = ({ onReset, sessionActive, setSessionActive }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    total_frames: 0,
    analyzed_frames: 0,
    calibrated: false,
    baseline: null,
    stats: {
      same_person: 0,
      different_person: 0,
      deviation: 0,
      gaze_deviation: 0,
      multiple_person: 0,
      prohibited_object: 0
    }
  });
  
  const webcamRef = useRef(null);
  const intervalRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    newSocket.on('frame_result', (data) => {
      handleFrameResult(data);
    });

    newSocket.on('calibration_complete', (data) => {
      console.log('Baseline calibration completed:', data.baseline);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleFrameResult = (data) => {
    if (data.error) {
      console.error('Frame processing error:', data.error);
      return;
    }

    if (data.no_face) {
      return; // Don't add alert for every frame without face
    }

    setCurrentFrame(data);

    // Check for violations
    if (data.identity === 'Unauthorized') {
      addAlert('identity', 'Unauthorized person detected - identity mismatch!', `Distance: ${data.distance?.toFixed(3)}`);
    }

    if (data.pose?.status === 'Deviating') {
      const details = `ΔY: ${data.pose.relative_yaw.toFixed(1)}°, ΔP: ${data.pose.relative_pitch.toFixed(1)}°, ΔR: ${data.pose.relative_roll.toFixed(1)}°`;
      addAlert('pose', `Head position deviation detected`, details);
    }

    if (data.gaze?.suspicious) {
      addAlert('gaze', `Looking away from screen - ${data.gaze.direction}`, `L: ${data.gaze.left_ratio.toFixed(2)}, R: ${data.gaze.right_ratio.toFixed(2)}`);
    }

    if (data.detection?.person_count > 1) {
      addAlert('person', `Multiple persons detected in frame`, `Count: ${data.detection.person_count}`);
    }

    if (data.detection?.objects && Object.keys(data.detection.objects).length > 0) {
      const objectList = Object.entries(data.detection.objects)
        .map(([obj, count]) => `${obj} (${count})`)
        .join(', ');
      addAlert('object', `Prohibited objects detected: ${objectList}`);
    }
  };

  const addAlert = (type, message, details = null) => {
    const alert = {
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    
    setAlerts(prev => [...prev, alert].slice(-100)); // Keep last 100 alerts
  };

  const captureAndSendFrame = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc && socket) {
        socket.emit('process_frame', { image: imageSrc });
      }
    }
  };

  const startSession = async () => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/start-session`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setSessionActive(true);
        intervalRef.current = setInterval(captureAndSendFrame, 1000); // Process every second
        console.log('Proctoring session started');
      }
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const stopSession = async () => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/stop-session`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setSessionActive(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        console.log('Proctoring session stopped');
      }
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/get-stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    if (sessionActive) {
      const statsInterval = setInterval(fetchStats, 2000);
      return () => clearInterval(statsInterval);
    }
  }, [sessionActive]);

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Online Exam Proctoring</h1>
            <p className="text-gray-600 mt-1">Real-time monitoring and violation detection</p>
          </div>
          
          <div className="flex items-center gap-4">
            <StatusIndicator connected={connected} calibrated={stats.calibrated} />
            
            {!sessionActive ? (
              <button onClick={startSession} className="btn btn-primary">
                <Play className="w-5 h-5 mr-2" />
                Start Session
              </button>
            ) : (
              <button onClick={stopSession} className="btn btn-danger">
                <Pause className="w-5 h-5 mr-2" />
                Stop Session
              </button>
            )}
            
            <button onClick={onReset} className="btn btn-secondary">
              <RotateCcw className="w-5 h-5 mr-2" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Video Feed */}
        <div className="lg:col-span-2 space-y-6">
          {/* Webcam Feed */}
          <div className="card">
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                mirrored={true}
              />
              
              {/* Status Overlays */}
              {sessionActive && currentFrame && (
                <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-2">
                  <div className={`badge ${
                    currentFrame.identity === 'Authorized' 
                      ? 'badge-success' 
                      : 'badge-danger'
                  }`}>
                    <Shield className="w-4 h-4 inline mr-1" />
                    {currentFrame.identity}
                  </div>
                  
                  {currentFrame.calibrated ? (
                    <>
                      <div className={`badge ${
                        currentFrame.pose.status === 'Normal' 
                          ? 'badge-success' 
                          : currentFrame.pose.status === 'Deviating'
                          ? 'badge-danger'
                          : 'badge-info'
                      }`}>
                        <Activity className="w-4 h-4 inline mr-1" />
                        {currentFrame.pose.status}
                      </div>
                      
                      <div className={`badge ${
                        !currentFrame.gaze.suspicious 
                          ? 'badge-success' 
                          : 'badge-warning'
                      }`}>
                        <Eye className="w-4 h-4 inline mr-1" />
                        {currentFrame.gaze.direction}
                      </div>
                      
                      <div className={`badge ${
                        currentFrame.detection.person_count === 1 
                          ? 'badge-success' 
                          : 'badge-danger'
                      }`}>
                        <Users className="w-4 h-4 inline mr-1" />
                        {currentFrame.detection.person_count} Person(s)
                      </div>
                    </>
                  ) : (
                    <div className="badge badge-info animate-pulse">
                      Calibrating: {currentFrame.calibration_progress}/{stats.calibrated ? 3 : currentFrame.calibration_progress}/3
                    </div>
                  )}
                </div>
              )}
              
              {!sessionActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <div className="text-center text-white">
                    <Play className="w-16 h-16 mx-auto mb-4 opacity-70" />
                    <p className="text-lg font-medium">Session Not Active</p>
                    <p className="text-sm opacity-75">Click "Start Session" to begin</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Statistics */}
          <Statistics stats={stats} currentFrame={currentFrame} />
        </div>

        {/* Right Column - Alerts */}
        <div className="lg:col-span-1">
          <AlertPanel alerts={alerts} />
        </div>
      </div>
    </div>
  );
};

export default ProctoringSession;
