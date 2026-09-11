import { useEffect, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type PhotoSetter = (file: File | null) => void;

type GooglePickerDocument = {
  id: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
};

type PickerCallbackData = {
  action: string;
  docs?: GooglePickerDocument[];
};

declare global {
  interface Window {
    gapi?: {
      load: (
        library: string,
        options: { callback: () => void; onerror?: () => void }
      ) => void;
    };
    google?: {
      picker?: any;
    };
  }
}

const PICKER_SCRIPT_URL = 'https://apis.google.com/js/api.js';
const PICKER_API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY) as string | undefined;
const PICKER_APP_ID = (import.meta.env.VITE_GOOGLE_APP_ID || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) as string | undefined;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let pickerLoadPromise: Promise<void> | null = null;

function loadPickerApi(): Promise<void> {
  if (window.gapi && window.google?.picker) return Promise.resolve();
  if (pickerLoadPromise) return pickerLoadPromise;

  pickerLoadPromise = new Promise<void>((resolve, reject) => {
    const loadPicker = () => {
      if (!window.gapi) {
        reject(new Error('Photo selection is unavailable right now.'));
        return;
      }

      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Photo selection is unavailable right now.')),
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${PICKER_SCRIPT_URL}"]`
    );

    if (existingScript) {
      if (window.gapi) loadPicker();
      else existingScript.addEventListener('load', loadPicker, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Photo selection is unavailable right now.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PICKER_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = loadPicker;
    script.onerror = () => reject(new Error('Photo selection is unavailable right now.'));
    document.body.appendChild(script);
  });

  return pickerLoadPromise;
}

function isSupportedImage(document: GooglePickerDocument): boolean {
  return IMAGE_MIME_TYPES.includes(document.mimeType || '');
}

export default function GoogleDrivePhotoPicker({ onFile }: { onFile: PhotoSetter }) {
  const { toast } = useToast();
  const targetRef = useRef<PhotoSetter>(onFile);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    targetRef.current = onFile;
  }, [onFile]);

  useEffect(() => {
    void loadPickerApi().catch(() => {
      // Loading is retried when the user clicks the button.
    });
  }, []);

  const openPicker = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    onSuccess: async ({ access_token: accessToken }) => {
      try {
        if (!PICKER_API_KEY || !PICKER_APP_ID) {
          throw new Error('Photo selection is not available right now.');
        }

        await loadPickerApi();
        const picker = window.google?.picker;
        if (!picker) throw new Error('Photo selection is unavailable right now.');

        const imageView = new picker.DocsView(picker.ViewId.DOCS_IMAGES)
          .setIncludeFolders(false)
          .setSelectFolderEnabled(false)
          .setMimeTypes(IMAGE_MIME_TYPES.join(','));

        const pickerWindow = new picker.PickerBuilder()
          .setDeveloperKey(PICKER_API_KEY)
          .setAppId(PICKER_APP_ID)
          .setOAuthToken(accessToken)
          .addView(imageView)
          .setCallback((data: PickerCallbackData) => {
            if (data.action === picker.Action.CANCEL) {
              setIsOpening(false);
              return;
            }
            if (data.action !== picker.Action.PICKED || !data.docs?.[0]) return;
            void downloadSelectedPhoto(data.docs[0], accessToken);
          })
          .build();

        pickerWindow.setVisible(true);
      } catch (error) {
        setIsOpening(false);
        toast({
          variant: 'destructive',
          title: 'Could not open your photos',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      }
    },
    onError: () => {
      setIsOpening(false);
      toast({
        variant: 'destructive',
        title: 'Photo access was not granted',
        description: 'Allow access to your photos to choose one from Drive.',
      });
    },
  });

  const downloadSelectedPhoto = async (document: GooglePickerDocument, accessToken: string) => {
    try {
      if (!isSupportedImage(document)) {
        throw new Error('Please choose a JPG, PNG, WEBP, or GIF image.');
      }

      if (document.sizeBytes && document.sizeBytes > 5 * 1024 * 1024) {
        throw new Error('Please choose an image under 5 MB.');
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.id)}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) throw new Error('We could not download that photo. Please choose another one.');

      const blob = await response.blob();
      if (!IMAGE_MIME_TYPES.includes(blob.type)) {
        throw new Error('Please choose a JPG, PNG, WEBP, or GIF image.');
      }
      if (blob.size > 5 * 1024 * 1024) {
        throw new Error('Please choose an image under 5 MB.');
      }

      const extension = blob.type.split('/')[1] || 'jpg';
      const fileName = document.name || `drive-photo.${extension}`;
      targetRef.current(new File([blob], fileName, { type: blob.type }));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not use that photo',
        description: error instanceof Error ? error.message : 'Please choose another image.',
      });
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isOpening}
      onClick={() => {
        setIsOpening(true);
        openPicker();
      }}
      className="mt-2 w-full text-xs"
    >
      {isOpening ? 'Opening photos…' : 'Choose from Google Drive'}
    </Button>
  );
}