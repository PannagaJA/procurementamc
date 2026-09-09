import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import imageCompression from 'browser-image-compression';

interface PhotoUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
  label: string;
  accept?: string;
}

export const PhotoUpload = ({ value, onChange, label, accept = "image/*" }: PhotoUploadProps) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const compressImage = useCallback(async (file: File): Promise<File> => {
    try {
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error('Error compressing image:', error);
      toast({
        variant: "destructive",
        title: "Compression Error",
        description: "Failed to compress image. Using original.",
      });
      return file;
    }
  }, [toast]);

  // Create preview URL when file changes
  useEffect(() => {
    if (value) {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [value]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Use back camera if available
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const capturePhoto = useCallback(async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
            const compressedFile = await compressImage(file);
            onChange(compressedFile);
            setIsCameraOpen(false);
            stopCamera();
            toast({
              title: "Photo captured",
              description: "Photo has been captured and compressed successfully.",
            });
          }
        }, 'image/jpeg', 0.8);
      }
    }
  }, [onChange, stopCamera, toast, compressImage]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file) {
      const compressedFile = await compressImage(file);
      onChange(compressedFile);
    } else {
      onChange(null);
    }
  };

  const handleCameraOpen = () => {
    setIsCameraOpen(true);
    startCamera();
  };

  const handleCameraClose = () => {
    setIsCameraOpen(false);
    stopCamera();
  };

  const removePhoto = () => {
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 p-6 bg-gradient-to-br from-muted/50 to-muted rounded-xl shadow-sm border">
      <label className="text-lg font-semibold text-foreground block">
        {label}
      </label>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-3 px-4 bg-background border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all duration-300 hover:scale-105 hover:shadow-lg rounded-lg font-medium"
        >
          Upload File
        </Button>

        <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              onClick={handleCameraOpen}
              className="flex-1 py-3 px-4 bg-background border-2 border-dashed border-border hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950/20 transition-all duration-300 hover:scale-105 hover:shadow-lg rounded-lg font-medium"
            >
              Camera
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-background rounded-xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground">Capture Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 bg-black object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={capturePhoto} 
                  className="flex-1 py-2 bg-primary hover:bg-primary/90 transition-all duration-300 hover:scale-105 rounded-lg font-medium"
                >
                  Capture
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleCameraClose}
                  className="flex-1 py-2 border-border hover:bg-accent transition-all duration-300 hover:scale-105 rounded-lg font-medium"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />

      {value && (
        <div className="flex items-center gap-4 p-4 bg-card border rounded-lg shadow-md animate-in fade-in-0 duration-500">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border-2 border-border shadow-sm"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-card-foreground truncate">
              {value.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {(value.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removePhoto}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-300 hover:scale-110 rounded-full p-2"
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
};