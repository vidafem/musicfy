import React, { useRef, useState, useEffect } from 'react';
import { getDisplacementMap } from '../../utils/displacement-utils';

/**
 * COMPONENTE REACT: LiquidButton
 * Ahora el filtro SVG se inyecta correctamente en el DOM en lugar de 
 * usar una Data URL, solucionando el problema de compatibilidad.
 */
export default function LiquidButton({ children, onClick, type = "button" }) {
  const containerRef = useRef(null);
  const [clicked, setClicked] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 300, height: 60 });
  // ID único para que múltiples botones no choquen entre sí
  const filterId = useRef(`displace-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setDimensions({ 
          width: containerRef.current.clientWidth || 300, 
          height: containerRef.current.clientHeight || 60 
        });
      }
    };
    measure();
    // Esperamos a que la fuente o diseño se asiente y recalculamos
    setTimeout(measure, 100);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const radius = 30; // Border radius del botón
  const depth = clicked ? 15 : 10; // Físicamente se hunde al presionar
  const strength = 80;
  const chromaticAberration = 3;

  // Obtenemos el mapa base
  const displacementMapUrl = getDisplacementMap({ height: dimensions.height, width: dimensions.width, radius, depth });

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '60px', marginTop: '10px' }}>
      
      {/* INYECCIÓN DEL FILTRO EN EL DOM: Es fundamental para que los navegadores lo procesen */}
      <svg width="0" height="0" style={{ position: 'absolute', display: 'block' }}>
        <filter id={filterId.current} colorInterpolationFilters="sRGB">
          <feImage x="0" y="0" height={dimensions.height} width={dimensions.width} href={displacementMapUrl} result="displacementMap" />
          <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale={strength + chromaticAberration * 2} xChannelSelector="R" yChannelSelector="G" />
          <feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedR" />
          <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale={strength + chromaticAberration} xChannelSelector="R" yChannelSelector="G" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedG" />
          <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale={strength} xChannelSelector="R" yChannelSelector="G" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="displacedB" />
          <feBlend in="displacedR" in2="displacedG" mode="screen"/>
          <feBlend in2="displacedB" mode="screen"/>
        </filter>
      </svg>

      <button 
        type={type}
        onClick={onClick}
        onMouseDown={() => setClicked(true)}
        onMouseUp={() => setClicked(false)}
        onMouseLeave={() => setClicked(false)}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '30px',
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
          transition: 'transform 0.1s',
          transform: clicked ? 'scale(0.97)' : 'scale(1)',
        }}
      >
        {/* LA CAPA MÁGICA: El div de fondo que recibe el filtro de distorsión */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: '30px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(8px)',
          filter: `url(#${filterId.current})`,
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.3)',
          pointerEvents: 'none'
        }}></div>

        <span style={{ position: 'relative', zIndex: 10, letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
          {children}
        </span>
      </button>
    </div>
  );
}
