import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function useGLTFLoader(url) {
  const [model, setModel] = useState(null);

  useEffect(() => {
    if (!url) return;
    let mounted = true;
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        if (!mounted) return;
        setModel(gltf.scene);
      },
      undefined,
      (err) => {
        // silent fallback
        console.warn('GLTF load failed', err);
        if (mounted) setModel(null);
      }
    );

    return () => {
      mounted = false;
    };
  }, [url]);

  return model;
}
