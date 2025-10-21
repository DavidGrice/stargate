// Minimal placeholder for GLTF loader hook. Replace with actual GLTFLoader usage later.
import { useEffect, useState } from 'react';

export default function useGLTFLoader(url) {
  const [model, setModel] = useState(null);

  useEffect(() => {
    if (!url) return;
    // placeholder: in future this will use THREE.GLTFLoader
    setModel(null);
  }, [url]);

  return model;
}
