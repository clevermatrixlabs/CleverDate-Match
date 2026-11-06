import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Video, Upload, RefreshCw, CheckCircle2, Film, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { uploadVideoProfileToFirebase, fetchUserVideoProfileFromFirebase } from '@/lib/firebase';
export interface VideoProfileUser {
  id: number;
  profileVideo?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  [key: string]: any;
}

interface VideoProfilePlayerProps {
  user: VideoProfileUser;
  isOwnProfile?: boolean;
  onVideoUpdated?: (newUrl: string) => void;
}

export function VideoProfilePlayer({ user, isOwnProfile = false, onVideoUpdated }: VideoProfilePlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(user.profileVideo || null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isLoadingVideo, setIsLoadingVideo] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Fetch video from Firebase Storage if not already attached on user object
  useEffect(() => {
    let active = true;

    async function loadFirebaseVideo() {
      if (user.profileVideo) {
        setVideoUrl(user.profileVideo);
        return;
      }

      setIsLoadingVideo(true);
      try {
        const storageUrl = await fetchUserVideoProfileFromFirebase(user.id);
        if (active && storageUrl) {
          setVideoUrl(storageUrl);
        }
      } catch (err) {
        console.warn('Error loading video from Firebase Storage:', err);
      } finally {
        if (active) setIsLoadingVideo(false);
      }
    }

    loadFirebaseVideo();

    return () => {
      active = false;
    };
  }, [user.id, user.profileVideo]);

  // Video time tracking
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Playback error:', e);
      });
    }
    triggerControlsDisplay();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
    triggerControlsDisplay();
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const targetTime = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const triggerControlsDisplay = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 2800);
  };

  // Video File Upload directly to Firebase Storage
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid File',
        description: 'Please select a valid MP4, WebM, or MOV video file.',
      });
      return;
    }

    // 50 MB limit
    if (file.size > 50 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Video Too Large',
        description: 'Please upload a video under 50 MB (15 to 60 seconds recommended).',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);

    try {
      toast({
        title: 'Uploading to Firebase Storage…',
        description: 'Uploading your short video profile directly to Firebase cloud storage.',
      });

      const downloadUrl = await uploadVideoProfileToFirebase(user.id, file, (progress) => {
        setUploadProgress(progress);
      });

      // Save the Firebase Storage URL to user profile
      await apiRequest('PATCH', '/users/me', {
        profileVideo: downloadUrl,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });

      setVideoUrl(downloadUrl);
      onVideoUpdated?.(downloadUrl);

      toast({
        title: 'Video Profile Saved! 🎥',
        description: 'Your short video profile is now stored in Firebase Storage and live on your profile.',
      });

      // Auto play newly uploaded video
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 500);

    } catch (err: any) {
      console.error('Firebase video upload failed:', err);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: err?.message || 'Failed to upload video to Firebase Storage. Please try again.',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatSeconds = (sec: number): string => {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900 leading-tight">Video Profile</h3>
            <span className="text-[10px] text-gray-500 font-medium">Stored on Firebase Storage</span>
          </div>
        </div>

        {videoUrl && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Active Video</span>
          </span>
        )}
      </div>

      {/* Uploading progress bar */}
      {isUploading && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-xs font-bold text-blue-900">
            <span>Uploading to Firebase Storage…</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2 bg-blue-200" />
          <p className="text-[11px] text-blue-700 leading-tight">
            Storing high-definition video directly in Firebase Storage bucket.
          </p>
        </div>
      )}

      {/* Video Viewport / Player */}
      {videoUrl ? (
        <div
          className="relative w-full aspect-[4/5] sm:aspect-video rounded-2xl overflow-hidden bg-black shadow-inner cursor-pointer group select-none"
          onClick={togglePlay}
          onMouseMove={triggerControlsDisplay}
          onTouchStart={triggerControlsDisplay}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            loop
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-cover"
          />

          {/* Center Play/Pause Overlay Animation */}
          {(!isPlaying || showControls) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] transition-opacity">
              <div className="w-14 h-14 rounded-full bg-white/90 text-gray-900 flex items-center justify-center shadow-xl transform transition-transform group-hover:scale-110">
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
              </div>
            </div>
          )}

          {/* Top Badge Overlay */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none text-white text-[11px] drop-shadow">
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span className="font-semibold">{user.firstName || 'User'}'s Story</span>
            </div>
          </div>

          {/* Bottom Custom Media Controls Overlay */}
          <div
            className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Timeline slider */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className="flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-1 hover:text-blue-400 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 hover:text-blue-400 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>

                <span className="text-[11px] text-white/80 font-mono">
                  {formatSeconds(currentTime)} / {formatSeconds(duration)}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1 hover:text-blue-400 transition-colors"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State Placeholder */
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            {isLoadingVideo ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <Video className="w-7 h-7" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">
              {isLoadingVideo ? 'Checking Firebase Storage…' : 'No Short Video Profile Yet'}
            </h4>
            <p className="text-gray-500 text-xs leading-relaxed max-w-xs mx-auto">
              {isOwnProfile
                ? 'Record or upload a 15–30 second introduction stored in Firebase Storage to get 3x more matches!'
                : `${user.firstName || 'This user'} has not uploaded a video profile yet.`}
            </p>
          </div>
        </div>
      )}

      {/* Own Profile: Upload / Replace Action Button */}
      {isOwnProfile && (
        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            variant="outline"
            disabled={isUploading}
            className="w-full h-11 rounded-xl border-purple-200 text-purple-700 bg-purple-50/50 hover:bg-purple-100 font-bold text-xs flex items-center justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Uploading to Firebase Storage ({uploadProgress}%)</span>
              </>
            ) : videoUrl ? (
              <>
                <Upload className="w-4 h-4" />
                <span>Replace Video Profile (Firebase Storage)</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Record / Upload Short Video to Firebase</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
