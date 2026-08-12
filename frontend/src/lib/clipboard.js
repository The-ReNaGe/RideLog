export async function copyToClipboard(text) {
  // Chemin normal (HTTPS ou localhost)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText a échoué, fallback', err);
      // on tente quand même le fallback ci-dessous
    }
  }
 
  // Fallback pour HTTP non sécurisé (accès LAN typique en self-hosted)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    console.error('Copie impossible (clipboard indisponible)', err);
    return false;
  }
}
 
