import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function ParticleWave() {
  const mountRef = useRef(null);

  useEffect(() => {
    if (mountRef.current && mountRef.current.children.length > 0) {
      mountRef.current.innerHTML = '';
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 4000);
    camera.position.z = 800;
    camera.position.y = 150;

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false }); // Antialias en false para mejor rendimiento
    // Limitar el pixel ratio para hacerla mucho más ligera en pantallas retina
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    mountRef.current.appendChild(renderer.domElement);

    // REDUCCIÓN DRÁSTICA DE PARTÍCULAS PARA MEJOR RENDIMIENTO
    // Antes: 50x50 = 2500. Ahora: 35x35 = 1225. (50% más rápido)
    const SEPARATION = 120, AMOUNTX = 35, AMOUNTY = 35;
    const numParticles = AMOUNTX * AMOUNTY;
    const positions = new Float32Array(numParticles * 3);
    
    let i = 0;
    for ( let ix = 0; ix < AMOUNTX; ix ++ ) {
      for ( let iy = 0; iy < AMOUNTY; iy ++ ) {
        positions[ i ] = ix * SEPARATION - ( ( AMOUNTX * SEPARATION ) / 2 );
        positions[ i + 1 ] = 0; 
        positions[ i + 2 ] = iy * SEPARATION - ( ( AMOUNTY * SEPARATION ) / 2 );
        i += 3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({ 
      color: 0xaaaaaa, 
      size: 4,
    });
    
    const particles = new THREE.Points( geometry, material );
    scene.add( particles );

    let mouseX = 0;
    let mouseY = 0;
    let count = 0;

    const onDocumentMouseMove = ( event ) => {
      mouseX = event.clientX - window.innerWidth / 2;
      mouseY = event.clientY - window.innerHeight / 2;
    };
    document.addEventListener( 'mousemove', onDocumentMouseMove );

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame( animate );

      camera.position.x += ( mouseX - camera.position.x ) * .05;
      camera.position.y += ( - mouseY + 200 - camera.position.y ) * .05;
      camera.lookAt( scene.position );

      const positions = particles.geometry.attributes.position.array;
      let i = 0;
      for ( let ix = 0; ix < AMOUNTX; ix ++ ) {
        for ( let iy = 0; iy < AMOUNTY; iy ++ ) {
          positions[ i + 1 ] = ( Math.sin( ( ix + count ) * 0.5 ) * 80 ) +
                               ( Math.sin( ( iy + count ) * 0.5 ) * 80 );
          i += 3;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;

      renderer.render( scene, camera );
      count += 0.06;
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', onDocumentMouseMove);
      if (mountRef.current) {
        mountRef.current.innerHTML = '';
      }
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} />;
}
