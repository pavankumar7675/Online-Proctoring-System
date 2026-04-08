import { TrendingUp, AlertTriangle, Eye, Users, Package } from 'lucide-react';

const Statistics = ({ stats, currentFrame }) => {
  const getPercentage = (value, total) => {
    if (total === 0) return 0;
    return ((value / total) * 100).toFixed(1);
  };

  const getStatusClass = (percentage, threshold) => {
    return percentage >= threshold ? 'text-red-600' : 'text-green-600';
  };

  return (
    <div className="card">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Session Statistics</h2>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Frames</p>
              <p className="text-2xl font-bold text-blue-900">{stats.total_frames}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-400" />
          </div>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Analyzed</p>
              <p className="text-2xl font-bold text-purple-900">{stats.analyzed_frames}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Baseline Info */}
      {stats.calibrated && stats.baseline && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-green-900 mb-2">Baseline Head Pose</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-green-600">Yaw:</span>
              <span className="font-mono ml-1 text-green-900">{stats.baseline.yaw?.toFixed(1)}°</span>
            </div>
            <div>
              <span className="text-green-600">Pitch:</span>
              <span className="font-mono ml-1 text-green-900">{stats.baseline.pitch?.toFixed(1)}°</span>
            </div>
            <div>
              <span className="text-green-600">Roll:</span>
              <span className="font-mono ml-1 text-green-900">{stats.baseline.roll?.toFixed(1)}°</span>
            </div>
          </div>
        </div>
      )}

      {stats.tuning && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-slate-900 mb-2">Tuning Profile</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-600">Profile:</span>
              <span className="ml-1 font-semibold text-slate-900">{stats.tuning.profile}</span>
            </div>
            <div>
              <span className="text-slate-600">Logging:</span>
              <span className={`ml-1 font-semibold ${stats.tuning.debug_logging_enabled ? 'text-green-700' : 'text-slate-700'}`}>
                {stats.tuning.debug_logging_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Log Format:</span>
              <span className="ml-1 font-mono text-slate-900">{stats.tuning.debug_log_format || 'jsonl'}</span>
            </div>
            <div className="col-span-2 break-all">
              <span className="text-slate-600">Log Path:</span>
              <span className="ml-1 font-mono text-slate-900">{stats.tuning.debug_log_path || 'Not enabled'}</span>
            </div>
          </div>

          {stats.thresholds && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono text-slate-700">
              <div>Face ratio: {stats.thresholds.passive_liveness_min_face_ratio}</div>
              <div>Brightness: {stats.thresholds.passive_liveness_min_brightness}-{stats.thresholds.passive_liveness_max_brightness}</div>
              <div>Blur var: {stats.thresholds.passive_liveness_min_blur_variance}</div>
              <div>EAR threshold: {stats.thresholds.passive_ear_threshold}</div>
              <div>Blink frames: {stats.thresholds.passive_ear_closed_frames_min}</div>
              <div>Motion std: {stats.thresholds.passive_motion_static_std_threshold}/{stats.thresholds.passive_motion_natural_std_threshold}</div>
            </div>
          )}
        </div>
      )}

      {/* Current Frame Details */}
      {currentFrame && stats.calibrated && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Current Frame Analysis</h3>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Identity Match:</span>
              <span className={`font-medium ${
                currentFrame.identity === 'Authorized' ? 'text-green-600' : 'text-red-600'
              }`}>
                {currentFrame.distance?.toFixed(3)}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Head Deviation:</span>
              <span className="font-mono text-gray-900">
                ΔY: {currentFrame.pose.relative_yaw?.toFixed(1)}° 
                ΔP: {currentFrame.pose.relative_pitch?.toFixed(1)}°
                ΔR: {currentFrame.pose.relative_roll?.toFixed(1)}°
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Gaze Ratios:</span>
              <span className="font-mono text-gray-900">
                L: {currentFrame.gaze.left_ratio?.toFixed(2)} 
                R: {currentFrame.gaze.right_ratio?.toFixed(2)}
              </span>
            </div>

            {currentFrame.liveness && (
              <div className="flex justify-between">
                <span className="text-gray-600">Passive Liveness:</span>
                <span className={`font-medium ${
                  currentFrame.liveness.passive_label === 'live'
                    ? 'text-green-600'
                    : currentFrame.liveness.passive_label === 'spoof'
                    ? 'text-red-600'
                    : currentFrame.liveness.passive_label === 'quality_insufficient'
                    ? 'text-orange-600'
                    : 'text-yellow-600'
                }`}>
                  {currentFrame.liveness.passive_label} ({currentFrame.liveness.passive_score?.toFixed(2)})
                </span>
              </div>
            )}

            {currentFrame.liveness?.quality_insufficient && (
              <div className="flex justify-between">
                <span className="text-gray-600">Quality Gate:</span>
                <span className="font-medium text-orange-600">
                  Insufficient
                </span>
              </div>
            )}

            {currentFrame.liveness?.signals && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">Blink Rate:</span>
                  <span className="font-mono text-gray-900">
                    {currentFrame.liveness.signals.blink_rate_per_min?.toFixed(1)} /min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Blink Recent:</span>
                  <span className={`font-medium ${
                    currentFrame.liveness.signals.blink_detected_recently ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {currentFrame.liveness.signals.blink_detected_recently ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg EAR:</span>
                  <span className="font-mono text-gray-900">
                    {currentFrame.liveness.signals.avg_ear?.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Motion Consistency:</span>
                  <span className={`font-medium ${
                    currentFrame.liveness.signals.motion_label === 'consistent'
                      ? 'text-green-600'
                      : currentFrame.liveness.signals.motion_label === 'static' || currentFrame.liveness.signals.motion_label === 'unstable'
                      ? 'text-red-600'
                      : 'text-yellow-600'
                  }`}>
                    {currentFrame.liveness.signals.motion_label} ({currentFrame.liveness.signals.motion_consistency_score?.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Motion Delta:</span>
                  <span className="font-mono text-gray-900">
                    {currentFrame.liveness.signals.motion_delta?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Anti-Spoof Model:</span>
                  <span className={`font-medium ${
                    currentFrame.liveness.signals.anti_spoof_mode === 'onnxruntime' ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {currentFrame.liveness.signals.anti_spoof_mode || 'fallback'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Anti-Spoof Live:</span>
                  <span className="font-mono text-gray-900">
                    {currentFrame.liveness.signals.anti_spoof_live_score?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Anti-Spoof Label:</span>
                  <span className={`font-medium ${
                    currentFrame.liveness.signals.anti_spoof_label === 'live'
                      ? 'text-green-600'
                      : currentFrame.liveness.signals.anti_spoof_label === 'spoof'
                      ? 'text-red-600'
                      : 'text-yellow-600'
                  }`}>
                    {currentFrame.liveness.signals.anti_spoof_label}
                  </span>
                </div>
                {currentFrame.liveness.signals.quality_reason && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quality Reason:</span>
                    <span className="font-medium text-orange-600 text-right">
                      {currentFrame.liveness.signals.quality_reason}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {stats.passive_liveness && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-indigo-900 mb-2">Passive Liveness (Heuristic)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-indigo-700">Current:</span>
              <span className="ml-1 font-semibold text-indigo-900">{stats.passive_liveness.label}</span>
            </div>
            <div>
              <span className="text-indigo-700">Avg Score:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.avg_score?.toFixed?.(2) ?? '0.00'}</span>
            </div>
            <div>
              <span className="text-indigo-700">Live:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.live ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Suspicious:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.suspicious ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Spoof:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.spoof ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Quality Low:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.quality_insufficient ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Motion Consistent:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.motion_consistent ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Motion Static:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.motion_static ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Motion Unstable:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.motion_unstable ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Motion Variable:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.motion_variable ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Evaluated:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.frames_evaluated ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Blink Count:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.blink_count ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Blink Rate:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.blink_rate_per_min?.toFixed?.(1) ?? '0.0'}/min</span>
            </div>
            <div>
              <span className="text-indigo-700">Blink Recent:</span>
              <span className={`ml-1 font-semibold ${stats.passive_liveness.stats?.blink_detected_recently ? 'text-green-700' : 'text-yellow-700'}`}>
                {stats.passive_liveness.stats?.blink_detected_recently ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-indigo-700">Model Live:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.anti_spoof_model_live ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Model Spoof:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.anti_spoof_model_spoof ?? 0}</span>
            </div>
            <div>
              <span className="text-indigo-700">Model Missing:</span>
              <span className="ml-1 font-mono text-indigo-900">{stats.passive_liveness.stats?.anti_spoof_model_missing ?? 0}</span>
            </div>
          </div>

          {stats.passive_liveness?.model && (
            <div className={`mt-4 rounded-lg border p-4 ${stats.passive_liveness.model.available ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              <h3 className="font-semibold mb-2 text-gray-900">Anti-Spoof Model Status</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Available:</span>
                  <span className={`ml-1 font-semibold ${stats.passive_liveness.model.available ? 'text-green-700' : 'text-yellow-700'}`}>
                    {stats.passive_liveness.model.available ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Mode:</span>
                  <span className="ml-1 font-mono text-gray-900">{stats.passive_liveness.model.mode}</span>
                </div>
                <div className="col-span-2 break-all">
                  <span className="text-gray-600">Path:</span>
                  <span className="ml-1 font-mono text-gray-900">{stats.passive_liveness.model.path || 'Not configured'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Violation Statistics */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900">Violation Metrics</h3>
        
        {/* Head Pose Deviation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-gray-700">Head Deviation</span>
          </div>
          <div className="text-right">
            <span className={`text-sm font-semibold ${
              getStatusClass(parseFloat(getPercentage(stats.stats.deviation, stats.analyzed_frames)), 25)
            }`}>
              {stats.stats.deviation} ({getPercentage(stats.stats.deviation, stats.analyzed_frames)}%)
            </span>
            <span className="text-xs text-gray-500 ml-1">/ 25%</span>
          </div>
        </div>

        {/* Gaze Deviation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-700">Gaze Deviation</span>
          </div>
          <div className="text-right">
            <span className={`text-sm font-semibold ${
              getStatusClass(parseFloat(getPercentage(stats.stats.gaze_deviation, stats.analyzed_frames)), 30)
            }`}>
              {stats.stats.gaze_deviation} ({getPercentage(stats.stats.gaze_deviation, stats.analyzed_frames)}%)
            </span>
            <span className="text-xs text-gray-500 ml-1">/ 30%</span>
          </div>
        </div>

        {/* Multiple Persons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-gray-700">Multiple Persons</span>
          </div>
          <div className="text-right">
            <span className={`text-sm font-semibold ${
              getStatusClass(parseFloat(getPercentage(stats.stats.multiple_person, stats.analyzed_frames)), 20)
            }`}>
              {stats.stats.multiple_person} ({getPercentage(stats.stats.multiple_person, stats.analyzed_frames)}%)
            </span>
            <span className="text-xs text-gray-500 ml-1">/ 20%</span>
          </div>
        </div>

        {/* Prohibited Objects */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-700">Prohibited Objects</span>
          </div>
          <div className="text-right">
            <span className={`text-sm font-semibold ${
              getStatusClass(parseFloat(getPercentage(stats.stats.prohibited_object, stats.analyzed_frames)), 15)
            }`}>
              {stats.stats.prohibited_object} ({getPercentage(stats.stats.prohibited_object, stats.analyzed_frames)}%)
            </span>
            <span className="text-xs text-gray-500 ml-1">/ 15%</span>
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="mt-4 space-y-2">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              getPercentage(stats.stats.deviation, stats.analyzed_frames) >= 25 
                ? 'bg-red-500' 
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(100, getPercentage(stats.stats.deviation, stats.analyzed_frames))}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default Statistics;
