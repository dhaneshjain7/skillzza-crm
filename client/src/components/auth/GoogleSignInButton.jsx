import { useEffect, useRef } from 'react';

// Loads Google Identity Services script once, then renders the official
// "Sign in with Google" button into the given container.
// onSuccess receives the raw Google ID token (credential) string.

let gsiScriptLoading = null;

const loadGsiScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptLoading) return gsiScriptLoading;

  gsiScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return gsiScriptLoading;
};

const GoogleSignInButton = ({ onSuccess, onError, clientId }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadGsiScript();
        if (cancelled || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              onSuccess(response.credential);
            } else {
              onError?.('No credential received from Google.');
            }
          },
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          shape: 'pill',
          text: 'continue_with',
        });
      } catch (err) {
        console.error('Google Sign-In failed to load:', err);
        onError?.('Failed to load Google Sign-In.');
      }
    };

    init();
    return () => { cancelled = true; };
  }, [clientId, onSuccess, onError]);

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />;
};

export default GoogleSignInButton;
