import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import useGLTFLoader from '../../hooks/useGLTFLoader';

export default function ThreeScene() {
  const containerRef = useRef(null);
  const model = useGLTFLoader('/models/stargate.glb');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(light);

    // placeholder geometry (torus) instead of GLTF for incremental integration
    const geo = new THREE.TorusGeometry(1, 0.3, 16, 100);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3366ff, metalness: 0.3, roughness: 0.5 });
    let torus = new THREE.Mesh(geo, mat);
    torus.name = 'placeholder-ring';
    scene.add(torus);

    // If a GLTF model is provided, attach it instead of the torus
    if (model) {
      // Remove placeholder and add model
      scene.remove(torus);
      model.position.set(0, 0, 0);
      scene.add(model);
      torus = null;
    }

    let req = null;
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', onResize);

    const animate = () => {
      if (torus) torus.rotation.y += 0.01;
      renderer.render(scene, camera);
      req = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (req) cancelAnimationFrame(req);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}
