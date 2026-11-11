// Local browsing keeps the separate loopback origin. Remote browsing uses the
// public address inside an opaque sandbox, so previews cannot access the shell.
export const localPreview = location.protocol === 'http:' && location.hostname === 'localhost';
export const proxyOrigin = localPreview ? `http://127.0.0.1:${location.port}` : location.origin;
export const proxyMessageOrigin = localPreview ? proxyOrigin : 'null';
export function configurePreview(frame, proxied) {
  const opaque = proxied && !localPreview;
  frame.setAttribute('sandbox', `allow-scripts ${opaque ? '' : 'allow-same-origin '}allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads`);
}
