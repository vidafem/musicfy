import React, { useRef, useEffect } from 'react';

/**
 * COMPONENTE WRAPPER PARA EL WEB COMPONENT NATIVO
 * 
 * Se ha optimizado para evitar re-renderizados innecesarios.
 * Al comparar los props como un string, evitamos el "parpadeo" 
 * que ocurría cuando React recargaba el componente al escribir o hacer clic.
 */
export default function GlassButtonWrapper({ children, className, onClick, ...props }) {
  const ref = useRef(null);
  
  // Convertimos las propiedades a string para comparar y evitar re-renders infinitos (esto arregla el parpadeo en pantalla)
  const propsString = JSON.stringify(props);
  
  useEffect(() => {
    if (ref.current) {
      Object.keys(props).forEach(key => {
        // Solo aplica si el valor realmente cambió
        if (ref.current.getAttribute(key) !== String(props[key])) {
          ref.current.setAttribute(key, props[key]);
        }
      });
      // Aseguramos que auto-size se active correctamente
      if (!ref.current.hasAttribute('auto-size')) {
        ref.current.setAttribute('auto-size', '');
      }
    }
  }, [propsString]);

  return (
    <glass-element ref={ref} onClick={onClick} class={className}>
      {children}
    </glass-element>
  );
}
