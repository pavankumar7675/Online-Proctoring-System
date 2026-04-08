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
  const [liveCounters, setLiveCounters] = useState({
    analyzed_frames: 0,
    head: { normal: 0, deviated: 0 },
    gaze: { centered: 0, away: 0 },
    passive_liveness: { live: 0, suspicious: 0, spoof: 0 },
    anti_spoof_model: { live: 0, spoof: 0, missing: 0 }
  });
  const [stats, setStats] = useState({
    total_frames: 0,
    analyzed_frames: 0,
    calibrated: false,
    baseline: null,
    passive_liveness: {
      score: 0,
      label: 'suspicious',
      stats: {
        live: 0,
        suspicious: 0,
        spoof: 0,
        quality_insufficient: 0,
        motion_static: 0,
        motion_consistent: 0,
        motion_unstable: 0,
        motion_variable: 0,
        motion_consistency_score: 0,
        motion_label: 'unknown',
        avg_score: 0,
        frames_evaluated: 0
      },
      model: {
        available: false,
        path: null,
        mode: 'none'
      }
    },
    tuning: {
      profile: 'balanced',
      profiles_available: ['strict', 'balanced', 'lenient'],
      debug_logging_enabled: false,
      debug_log_format: 'jsonl',
      debug_log_path: null
    },
    thresholds: {
      passive_liveness_min_face_ratio: 0,
      passive_liveness_min_brightness: 0,
      passive_liveness_max_brightness: 0,
      passive_liveness_min_blur_variance: 0,
      passive_ear_threshold: 0,
      passive_ear_closed_frames_min: 0,
      passive_ear_history_size: 0,
      passive_blink_recent_frame_window: 0,
      passive_motion_history_size: 0,
      passive_motion_static_std_threshold: 0,
      passive_motion_natural_std_threshold: 0,
      passive_motion_max_jump_threshold: 0,
      anti_spoof_model_path: null,
      anti_spoof_output_mode: 'auto'
    },
    stats: {
      same_person: 0,
      different_person: 0,
      deviation: 0,
      gaze_deviation: 0,
      multiple_person: 0,
      prohibited_object: 0,
      quality_insufficient: 0,
      motion_static: 0,
      motion_consistent: 0,
      motion_unstable: 0,
      motion_variable: 0
    }
  });

  const webcamRef = useRef(null);
  const intervalRef = useRef(null);
  const socketRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const inFlightFrameRef = useRef(false);
  const inFlightStartedAtRef = useRef(0);
  const latestQueuedFrameRef = useRef(null);

  const clearCaptureInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resetRealtimePipeline = () => {
    inFlightFrameRef.current = false;
    inFlightStartedAtRef.current = 0;
    latestQueuedFrameRef.current = null;
  };

  const countersFromStats = (statsData) => {
    const analyzed = Math.max(0, statsData?.analyzed_frames || 0);
    const deviation = statsData?.stats?.deviation || 0;
    const gazeDeviation = statsData?.stats?.gaze_deviation || 0;
    const livenessStats = statsData?.passive_liveness?.stats || {};

    return {
      analyzed_frames: analyzed,
      head: {
        normal: Math.max(0, analyzed - deviation),
        deviated: deviation
      },
      gaze: {
        centered: Math.max(0, analyzed - gazeDeviation),
        away: gazeDeviation
      },
      passive_liveness: {
        live: livenessStats.live || 0,
        suspicious: livenessStats.suspicious || 0,
        spoof: livenessStats.spoof || 0
      },
      anti_spoof_model: {
        live: livenessStats.anti_spoof_model_live || 0,
        spoof: livenessStats.anti_spoof_model_spoof || 0,
        missing: livenessStats.anti_spoof_model_missing || 0
      }
    };
  };

  const analyzedFrames = Math.max(0, liveCounters?.analyzed_frames || 0);
  const deviationFrames = liveCounters?.head?.deviated || 0;
  const gazeDeviationFrames = liveCounters?.gaze?.away || 0;
  const headNormalFrames = liveCounters?.head?.normal || 0;
  const gazeCenteredFrames = liveCounters?.gaze?.centered || 0;
  const passiveLivenessStats = liveCounters?.passive_liveness || {};

  const toPercent = (value, total) => {
    if (!total) {
      return '0.0';
    }
    return ((value / total) * 100).toFixed(1);
  };

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    socketRef.current = newSocket;

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
      clearCaptureInterval();
      resetRealtimePipeline();
      socketRef.current = null;
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) {
      clearCaptureInterval();
      resetRealtimePipeline();
    }
  }, [sessionActive]);

  const flushQueuedFrameIfAny = () => {
    if (!sessionActiveRef.current) {
      latestQueuedFrameRef.current = null;
      return;
    }

    if (inFlightFrameRef.current) {
      return;
    }

    const queuedFrame = latestQueuedFrameRef.current;
    if (!queuedFrame || !socketRef.current?.connected) {
      return;
    }

    latestQueuedFrameRef.current = null;
    inFlightFrameRef.current = true;
    inFlightStartedAtRef.current = Date.now();
    socketRef.current.emit('process_frame', { image: queuedFrame });
  };

  useEffect(() => {
    if (!sessionActive) {
      return undefined;
    }

    const watchdog = setInterval(() => {
      if (!inFlightFrameRef.current) {
        return;
      }

      const elapsedMs = Date.now() - inFlightStartedAtRef.current;
      if (elapsedMs > 3000) {
        inFlightFrameRef.current = false;
        inFlightStartedAtRef.current = 0;
        flushQueuedFrameIfAny();
      }
    }, 500);

    return () => clearInterval(watchdog);
  }, [sessionActive]);

  const handleFrameResult = (data) => {
    inFlightFrameRef.current = false;
    inFlightStartedAtRef.current = 0;

    if (!sessionActiveRef.current) {
      return;
    }

    if (data.error) {
      console.error('Frame processing error:', data.error);
      flushQueuedFrameIfAny();
      return;
    }

    if (data.calibrated && data.pose?.status !== 'Calibrating') {
      setLiveCounters((prev) => {
        const analyzed = prev.analyzed_frames + 1;
        const headDeviated = prev.head.deviated + (data.pose?.status === 'Deviating' ? 1 : 0);
        const gazeAway = prev.gaze.away + (data.gaze?.suspicious ? 1 : 0);

        const passiveLabel = data.liveness?.passive_label;
        const antiSpoofLabel = data.liveness?.anti_spoof_label;

        return {
          analyzed_frames: analyzed,
          head: {
            normal: analyzed - headDeviated,
            deviated: headDeviated
          },
          gaze: {
            centered: analyzed - gazeAway,
            away: gazeAway
          },
          passive_liveness: {
            live: prev.passive_liveness.live + (passiveLabel === 'live' ? 1 : 0),
            suspicious: prev.passive_liveness.suspicious + (passiveLabel === 'suspicious' ? 1 : 0),
            spoof: prev.passive_liveness.spoof + (passiveLabel === 'spoof' ? 1 : 0)
          },
          anti_spoof_model: {
            live: prev.anti_spoof_model.live + (antiSpoofLabel === 'live' ? 1 : 0),
            spoof: prev.anti_spoof_model.spoof + (antiSpoofLabel === 'spoof' ? 1 : 0),
            missing: prev.anti_spoof_model.missing + (antiSpoofLabel === 'live' || antiSpoofLabel === 'spoof' ? 0 : 1)
          }
        };
      });
    }

    if (data.no_face) {
      flushQueuedFrameIfAny();
      return;
    }

    setCurrentFrame(data);

    if (data.identity === 'Unauthorized') {
      addAlert('identity', 'Unauthorized person detected - identity mismatch!', `Distance: ${data.distance?.toFixed(3)}`);
    }

    if (data.pose?.status === 'Deviating') {
      const details = `ΔY: ${data.pose.relative_yaw.toFixed(1)}°, ΔP: ${data.pose.relative_pitch.toFixed(1)}°, ΔR: ${data.pose.relative_roll.toFixed(1)}°`;
      addAlert('pose', 'Head position deviation detected', details);
    }

    if (data.gaze?.suspicious) {
      addAlert('gaze', `Looking away from screen - ${data.gaze.direction}`, `L: ${data.gaze.left_ratio.toFixed(2)}, R: ${data.gaze.right_ratio.toFixed(2)}`);
    }

    if (data.detection?.person_count > 1) {
      addAlert('person', 'Multiple persons detected in frame', `Count: ${data.detection.person_count}`);
    }

    if (data.detection?.objects && Object.keys(data.detection.objects).length > 0) {
      const objectList = Object.entries(data.detection.objects)
        .map(([obj, count]) => `${obj} (${count})`)
        .join(', ');
      addAlert('object', `Prohibited objects detected: ${objectList}`);
    }

    if (data.liveness?.passive_label === 'spoof') {
      addAlert('liveness', 'Passive liveness indicates potential spoof attempt', `Score: ${data.liveness.passive_score?.toFixed(2)}`);
    }

    if (data.liveness?.anti_spoof_label === 'spoof') {
      addAlert(
        'liveness',
        'Anti-spoof model flagged a spoof attempt',
        `Score: ${data.liveness.anti_spoof_spoof_score?.toFixed(2)}`
      );
    }

    if (data.liveness?.quality_insufficient) {
      addAlert(
        'quality',
        'Face quality is too low for reliable liveness decision',
        data.liveness.quality_guidance || 'Improve lighting and keep your face fully visible.'
      );
    }

    if (data.liveness?.motion_label === 'static' || data.liveness?.motion_label === 'unstable') {
      addAlert(
        'motion',
        `Motion pattern looks ${data.liveness.motion_label}`,
        `Score: ${data.liveness.motion_consistency_score?.toFixed(2)}`
      );
    }

    flushQueuedFrameIfAny();
  };

  const addAlert = (type, message, details = null) => {
    const alert = {
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    };

    setAlerts((prev) => [...prev, alert].slice(-100));
  };

  const captureAndSendFrame = () => {
    if (!webcamRef.current || !socketRef.current?.connected || !sessionActiveRef.current) {
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      return;
    }

    if (inFlightFrameRef.current) {
      latestQueuedFrameRef.current = imageSrc;
      return;
    }

    inFlightFrameRef.current = true;
    inFlightStartedAtRef.current = Date.now();
    socketRef.current.emit('process_frame', { image: imageSrc });
  };

  const startSession = async () => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/start-session`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        setSessionActive(true);
        setAlerts([]);
        setCurrentFrame(null);
        setLiveCounters({
          analyzed_frames: 0,
          head: { normal: 0, deviated: 0 },
          gaze: { centered: 0, away: 0 },
          passive_liveness: { live: 0, suspicious: 0, spoof: 0 },
          anti_spoof_model: { live: 0, spoof: 0, missing: 0 }
        });
        resetRealtimePipeline();
        clearCaptureInterval();
        fetchStats();
        intervalRef.current = setInterval(captureAndSendFrame, 120);
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
        clearCaptureInterval();
        resetRealtimePipeline();
        console.log('Proctoring session stopped');
      }
    } catch (error) {
      console.error('Failed to stop session:', error);
      clearCaptureInterval();
      resetRealtimePipeline();
      setSessionActive(false);
    }
  };

  const handleReset = async () => {
    clearCaptureInterval();
    resetRealtimePipeline();
    setAlerts([]);
    setCurrentFrame(null);
    setLiveCounters({
      analyzed_frames: 0,
      head: { normal: 0, deviated: 0 },
      gaze: { centered: 0, away: 0 },
      passive_liveness: { live: 0, suspicious: 0, spoof: 0 },
      anti_spoof_model: { live: 0, spoof: 0, missing: 0 }
    });
    setSessionActive(false);

    try {
      await fetch(`${SOCKET_URL}/api/stop-session`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to stop session during reset:', error);
    }

    onReset();
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/get-stats`);
      const data = await response.json();
      setStats(data);
      setLiveCounters(countersFromStats(data));
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    if (sessionActive) {
      const statsInterval = setInterval(fetchStats, 2000);
      return () => clearInterval(statsInterval);
    }
    return undefined;
  }, [sessionActive]);

  return (
    <div className="min-h-screen p-6">
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

            <button onClick={handleReset} className="btn btn-secondary">
              <RotateCcw className="w-5 h-5 mr-2" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                mirrored={true}
              />

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

                      {currentFrame.liveness && (
                        <div className={`badge ${
                          currentFrame.liveness.passive_label === 'live'
                            ? 'badge-success'
                            : currentFrame.liveness.passive_label === 'spoof'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}>
                          Passive Liveness: {currentFrame.liveness.passive_label} ({currentFrame.liveness.passive_score?.toFixed(2)})
                        </div>
                      )}

                      {currentFrame.liveness?.anti_spoof_label && (
                        <div className={`badge ${
                          currentFrame.liveness.anti_spoof_label === 'live'
                            ? 'badge-success'
                            : currentFrame.liveness.anti_spoof_label === 'spoof'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}>
                          Anti-Spoof: {currentFrame.liveness.anti_spoof_label}
                        </div>
                      )}
                      <div className="w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-2">
                        <div className="bg-black/65 text-white rounded-lg px-3 py-2 text-xs border border-white/20">
                          <div className="font-semibold text-orange-200">Head Pose</div>
                          <div className="mt-1 font-mono">Normal: {headNormalFrames}</div>
                          <div className="font-mono text-orange-100">Deviated: {deviationFrames} ({toPercent(deviationFrames, analyzedFrames)}%)</div>
                        </div>

                        <div className="bg-black/65 text-white rounded-lg px-3 py-2 text-xs border border-white/20">
                          <div className="font-semibold text-blue-200">Eye Gaze</div>
                          <div className="mt-1 font-mono">Centered: {gazeCenteredFrames}</div>
                          <div className="font-mono text-blue-100">Away: {gazeDeviationFrames} ({toPercent(gazeDeviationFrames, analyzedFrames)}%)</div>
                        </div>

                        <div className="bg-black/65 text-white rounded-lg px-3 py-2 text-xs border border-white/20">
                          <div className="font-semibold text-amber-200">Passive Liveness</div>
                          <div className="mt-1 font-mono">Live: {passiveLivenessStats.live || 0}</div>
                          <div className="font-mono">Suspicious: {passiveLivenessStats.suspicious || 0}</div>
                          <div className="font-mono text-red-200">Spoof: {passiveLivenessStats.spoof || 0}</div>
                        </div>

                        <div className="bg-black/65 text-white rounded-lg px-3 py-2 text-xs border border-white/20">
                          <div className="font-semibold text-emerald-200">Anti-Spoof Model</div>
                          <div className="mt-1 font-mono">Live: {liveCounters.anti_spoof_model.live || 0}</div>
                          <div className="font-mono text-red-200">Spoof: {liveCounters.anti_spoof_model.spoof || 0}</div>
                          <div className="font-mono text-yellow-200">Missing: {liveCounters.anti_spoof_model.missing || 0}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="badge badge-info animate-pulse">
                      Calibrating: {currentFrame.calibration_progress}/3
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

          <Statistics stats={stats} currentFrame={currentFrame} />
        </div>

        <div className="lg:col-span-1">
          <AlertPanel alerts={alerts} />
        </div>
      </div>
    </div>
  );
};

export default ProctoringSession;
