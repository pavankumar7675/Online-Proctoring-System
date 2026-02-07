"""
Flask Backend Server for Online Proctoring System
Provides REST API and WebSocket for real-time proctoring
"""

print(">>> Server starting...")

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import mediapipe as mp
from keras_facenet import FaceNet
from ultralytics import YOLO
import base64
import io
from PIL import Image
import time

print(">>> Imports done")

# ================= FLASK INITIALIZATION =================
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ================= AI MODELS INITIALIZATION =================
print(">>> Loading AI models...")
embedder = FaceNet()
print(">>> FaceNet loaded")

# MediaPipe Face Detection and Mesh
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh

face_detection = mp_face_detection.FaceDetection(
    model_selection=1,
    min_detection_confidence=0.6
)

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

print(">>> MediaPipe models loaded")

yolo_model = YOLO('yolov8n.pt')
print(">>> YOLO model loaded")

# ================= STATIC 3D FACE MODEL =================
model_3d = np.array([
    (0.0, 0.0, 0.0),
    (0.0, -63.6, -12.5),
    (-43.3, 32.7, -26.0),
    (43.3, 32.7, -26.0),
    (-28.9, -28.9, -24.1),
    (28.9, -28.9, -24.1)
], dtype=np.float64)

LANDMARK_IDS = [1, 152, 33, 263, 61, 291]

# Eye landmarks
LEFT_EYE_INNER = 133
LEFT_EYE_OUTER = 33
LEFT_IRIS = 468

RIGHT_EYE_INNER = 362
RIGHT_EYE_OUTER = 263
RIGHT_IRIS = 473

# YOLO classes
PERSON_CLASS = 0
CELL_PHONE_CLASS = 67
BOOK_CLASS = 73
LAPTOP_CLASS = 63

PROHIBITED_CLASSES = {
    CELL_PHONE_CLASS: 'Cell Phone',
    BOOK_CLASS: 'Book',
    LAPTOP_CLASS: 'Laptop'
}

# ================= SESSION STATE =================
session_state = {
    'reference_embedding': None,
    'baseline_yaw': None,
    'baseline_pitch': None,
    'baseline_roll': None,
    'baseline_calibrated': False,
    'calibration_yaws': [],
    'calibration_pitches': [],
    'calibration_rolls': [],
    'frame_count': 0,
    'same_person_frames': 0,
    'different_person_frames': 0,
    'deviation_frames': 0,
    'gaze_deviation_frames': 0,
    'multiple_person_frames': 0,
    'prohibited_object_frames': 0,
    'prohibited_objects_detected': {},
    'is_active': False,
    'CALIBRATION_FRAMES': 3
}

# ================= HELPER FUNCTIONS =================

def base64_to_image(base64_string):
    """Convert base64 string to OpenCV image"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        img_data = base64.b64decode(base64_string)
        img = Image.open(io.BytesIO(img_data))
        img_array = np.array(img)
        
        # Convert RGB to BGR for OpenCV
        if len(img_array.shape) == 3 and img_array.shape[2] == 3:
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        return img_array
    except Exception as e:
        print(f"Error converting base64 to image: {e}")
        return None

def get_face_embedding(frame, bbox):
    """Generate face embedding from frame and bounding box"""
    x, y, w, h = bbox
    face_crop = frame[y:y+h, x:x+w]

    if face_crop.size == 0:
        return None

    face_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
    face_crop = cv2.resize(face_crop, (160, 160))
    return embedder.embeddings([face_crop])[0]

def get_head_pose(frame, landmarks):
    """Calculate head pose angles"""
    h, w = frame.shape[:2]

    image_2d = np.array([
        (int(landmarks[i].x * w), int(landmarks[i].y * h))
        for i in LANDMARK_IDS
    ], dtype=np.float64)

    cam_matrix = np.array([
        [w, 0, w / 2],
        [0, w, h / 2],
        [0, 0, 1]
    ], dtype=np.float64)

    dist_coeffs = np.zeros((4, 1))

    _, rvec, _ = cv2.solvePnP(
        model_3d,
        image_2d,
        cam_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE
    )

    rot_matrix, _ = cv2.Rodrigues(rvec)
    sy = np.sqrt(rot_matrix[0, 0]**2 + rot_matrix[1, 0]**2)

    pitch = np.degrees(np.arctan2(rot_matrix[2, 1], rot_matrix[2, 2]))
    yaw   = np.degrees(np.arctan2(-rot_matrix[2, 0], sy))
    roll  = np.degrees(np.arctan2(rot_matrix[1, 0], rot_matrix[0, 0]))
    
    return yaw, pitch, roll

def get_eye_gaze(frame, landmarks):
    """Calculate eye gaze direction"""
    h, w = frame.shape[:2]
    
    # Left eye
    left_iris = landmarks[LEFT_IRIS]
    left_inner = landmarks[LEFT_EYE_INNER]
    left_outer = landmarks[LEFT_EYE_OUTER]
    
    left_iris_x = left_iris.x * w
    left_inner_x = left_inner.x * w
    left_outer_x = left_outer.x * w
    
    left_eye_width = abs(left_inner_x - left_outer_x)
    left_gaze_ratio = (left_iris_x - left_outer_x) / left_eye_width if left_eye_width > 0 else 0.5
    
    # Right eye
    right_iris = landmarks[RIGHT_IRIS]
    right_inner = landmarks[RIGHT_EYE_INNER]
    right_outer = landmarks[RIGHT_EYE_OUTER]
    
    right_iris_x = right_iris.x * w
    right_inner_x = right_inner.x * w
    right_outer_x = right_outer.x * w
    
    right_eye_width = abs(right_inner_x - right_outer_x)
    right_gaze_ratio = (right_iris_x - right_outer_x) / right_eye_width if right_eye_width > 0 else 0.5
    
    avg_gaze_ratio = (left_gaze_ratio + right_gaze_ratio) / 2
    
    if avg_gaze_ratio < 0.35:
        gaze_direction = "Looking Right"
    elif avg_gaze_ratio > 0.65:
        gaze_direction = "Looking Left"
    else:
        gaze_direction = "Looking Center"
    
    return left_gaze_ratio, right_gaze_ratio, gaze_direction

def detect_persons_and_objects(frame):
    """Detect persons and prohibited objects using YOLO"""
    results = yolo_model(frame, verbose=False)
    
    person_count = 0
    prohibited_objects = {}
    
    for result in results:
        boxes = result.boxes
        for box in boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            
            if cls == PERSON_CLASS and conf > 0.5:
                person_count += 1
            
            if cls in PROHIBITED_CLASSES and conf > 0.4:
                obj_name = PROHIBITED_CLASSES[cls]
                if obj_name not in prohibited_objects:
                    prohibited_objects[obj_name] = 0
                prohibited_objects[obj_name] += 1
    
    return person_count, prohibited_objects

# ================= API ENDPOINTS =================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'models_loaded': True,
        'timestamp': time.time()
    })

@app.route('/api/set-reference', methods=['POST'])
def set_reference():
    """Set reference image for face verification"""
    try:
        data = request.json
        image_data = data.get('image')
        
        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400
        
        frame = base64_to_image(image_data)
        if frame is None:
            return jsonify({'error': 'Invalid image data'}), 400
        
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_detection.process(rgb)
        
        if not result.detections:
            return jsonify({'error': 'No face detected in reference image'}), 400
        
        d = result.detections[0].location_data.relative_bounding_box
        h, w = frame.shape[:2]
        bbox = (
            max(0, int(d.xmin * w)),
            max(0, int(d.ymin * h)),
            int(d.width * w),
            int(d.height * h)
        )
        
        embedding = get_face_embedding(frame, bbox)
        if embedding is None:
            return jsonify({'error': 'Failed to generate face embedding'}), 400
        
        session_state['reference_embedding'] = embedding
        
        # Reset session
        session_state['baseline_calibrated'] = False
        session_state['calibration_yaws'] = []
        session_state['calibration_pitches'] = []
        session_state['calibration_rolls'] = []
        session_state['frame_count'] = 0
        session_state['same_person_frames'] = 0
        session_state['different_person_frames'] = 0
        session_state['deviation_frames'] = 0
        session_state['gaze_deviation_frames'] = 0
        session_state['multiple_person_frames'] = 0
        session_state['prohibited_object_frames'] = 0
        session_state['prohibited_objects_detected'] = {}
        
        return jsonify({
            'success': True,
            'message': 'Reference image set successfully'
        })
    
    except Exception as e:
        print(f"Error in set_reference: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/start-session', methods=['POST'])
def start_session():
    """Start proctoring session"""
    if session_state['reference_embedding'] is None:
        return jsonify({'error': 'Reference image not set'}), 400
    
    session_state['is_active'] = True
    return jsonify({'success': True, 'message': 'Session started'})

@app.route('/api/stop-session', methods=['POST'])
def stop_session():
    """Stop proctoring session"""
    session_state['is_active'] = False
    return jsonify({'success': True, 'message': 'Session stopped'})

@app.route('/api/get-stats', methods=['GET'])
def get_stats():
    """Get current session statistics"""
    total_frames = session_state['same_person_frames'] + session_state['different_person_frames']
    analyzed_frames = max(1, total_frames - session_state['CALIBRATION_FRAMES'])
    
    return jsonify({
        'total_frames': total_frames,
        'analyzed_frames': analyzed_frames,
        'calibrated': session_state['baseline_calibrated'],
        'baseline': {
            'yaw': session_state['baseline_yaw'],
            'pitch': session_state['baseline_pitch'],
            'roll': session_state['baseline_roll']
        } if session_state['baseline_calibrated'] else None,
        'stats': {
            'same_person': session_state['same_person_frames'],
            'different_person': session_state['different_person_frames'],
            'deviation': session_state['deviation_frames'],
            'gaze_deviation': session_state['gaze_deviation_frames'],
            'multiple_person': session_state['multiple_person_frames'],
            'prohibited_object': session_state['prohibited_object_frames']
        },
        'prohibited_objects': session_state['prohibited_objects_detected']
    })

# ================= WEBSOCKET EVENTS =================

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('connected', {'message': 'Connected to proctoring server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')

@socketio.on('process_frame')
def handle_frame(data):
    """Process a single frame from client"""
    try:
        if not session_state['is_active']:
            emit('frame_result', {'error': 'Session not active'})
            return
        
        if session_state['reference_embedding'] is None:
            emit('frame_result', {'error': 'Reference not set'})
            return
        
        image_data = data.get('image')
        frame = base64_to_image(image_data)
        
        if frame is None:
            emit('frame_result', {'error': 'Invalid frame data'})
            return
        
        session_state['frame_count'] += 1
        
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        det_result = face_detection.process(rgb)
        
        if not det_result.detections:
            emit('frame_result', {
                'no_face': True,
                'message': 'No face detected',
                'frame_count': session_state['frame_count']
            })
            return
        
        # Get bounding box
        d = det_result.detections[0].location_data.relative_bounding_box
        h, w = frame.shape[:2]
        bbox = (
            max(0, int(d.xmin * w)),
            max(0, int(d.ymin * h)),
            int(d.width * w),
            int(d.height * h)
        )
        
        # Face verification
        embedding = get_face_embedding(frame, bbox)
        if embedding is None:
            emit('frame_result', {'error': 'Failed to generate embedding'})
            return
        
        distance = np.linalg.norm(embedding - session_state['reference_embedding'])
        
        if distance < 1.0:
            session_state['same_person_frames'] += 1
            identity = "Authorized"
        else:
            session_state['different_person_frames'] += 1
            identity = "Unauthorized"
        
        # Head pose
        mesh_result = face_mesh.process(rgb)
        if not mesh_result.multi_face_landmarks:
            emit('frame_result', {'error': 'No face mesh detected'})
            return
        
        landmarks = mesh_result.multi_face_landmarks[0].landmark
        yaw, pitch, roll = get_head_pose(frame, landmarks)
        
        # Baseline calibration
        if not session_state['baseline_calibrated']:
            session_state['calibration_yaws'].append(yaw)
            session_state['calibration_pitches'].append(pitch)
            session_state['calibration_rolls'].append(roll)
            
            if len(session_state['calibration_yaws']) >= session_state['CALIBRATION_FRAMES']:
                session_state['baseline_yaw'] = np.mean(session_state['calibration_yaws'])
                session_state['baseline_pitch'] = np.mean(session_state['calibration_pitches'])
                session_state['baseline_roll'] = np.mean(session_state['calibration_rolls'])
                session_state['baseline_calibrated'] = True
                
                emit('calibration_complete', {
                    'baseline': {
                        'yaw': float(session_state['baseline_yaw']),
                        'pitch': float(session_state['baseline_pitch']),
                        'roll': float(session_state['baseline_roll'])
                    }
                })
            
            pose_status = "Calibrating"
            relative_yaw = 0
            relative_pitch = 0
            relative_roll = 0
        else:
            relative_yaw = yaw - session_state['baseline_yaw']
            relative_pitch = pitch - session_state['baseline_pitch']
            relative_roll = roll - session_state['baseline_roll']
            
            deviating = abs(relative_yaw) > 15 or abs(relative_pitch) > 10 or abs(relative_roll) > 10
            pose_status = "Deviating" if deviating else "Normal"
            
            if deviating:
                session_state['deviation_frames'] += 1
        
        # Eye gaze
        left_gaze, right_gaze, gaze_direction = get_eye_gaze(frame, landmarks)
        gaze_suspicious = gaze_direction != "Looking Center"
        
        if gaze_suspicious and session_state['baseline_calibrated']:
            session_state['gaze_deviation_frames'] += 1
        
        # YOLO detection
        person_count, detected_objects = detect_persons_and_objects(frame)
        
        if person_count > 1 and session_state['baseline_calibrated']:
            session_state['multiple_person_frames'] += 1
        
        if detected_objects and session_state['baseline_calibrated']:
            session_state['prohibited_object_frames'] += 1
            for obj, count in detected_objects.items():
                if obj not in session_state['prohibited_objects_detected']:
                    session_state['prohibited_objects_detected'][obj] = 0
                session_state['prohibited_objects_detected'][obj] += count
        
        # Send result
        result = {
            'success': True,
            'frame_count': session_state['frame_count'],
            'identity': identity,
            'distance': float(distance),
            'pose': {
                'status': pose_status,
                'yaw': float(yaw),
                'pitch': float(pitch),
                'roll': float(roll),
                'relative_yaw': float(relative_yaw),
                'relative_pitch': float(relative_pitch),
                'relative_roll': float(relative_roll)
            },
            'gaze': {
                'direction': gaze_direction,
                'suspicious': gaze_suspicious,
                'left_ratio': float(left_gaze),
                'right_ratio': float(right_gaze)
            },
            'detection': {
                'person_count': person_count,
                'objects': detected_objects
            },
            'calibrated': session_state['baseline_calibrated'],
            'calibration_progress': len(session_state['calibration_yaws']) if not session_state['baseline_calibrated'] else session_state['CALIBRATION_FRAMES']
        }
        
        emit('frame_result', result)
        
    except Exception as e:
        print(f"Error processing frame: {e}")
        import traceback
        traceback.print_exc()
        emit('frame_result', {'error': str(e)})

# ================= MAIN =================

if __name__ == '__main__':
    print("\n" + "="*50)
    print("Online Proctoring Server Ready!")
    print("="*50)
    print("Server running on http://localhost:5000")
    print("WebSocket ready for real-time proctoring")
    print("="*50 + "\n")
    
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
