import React from 'react';
import { Loader2, CheckCircle, X } from 'lucide-react';

export default function StatusModal({ statusModal, onClose }) {
  if (!statusModal.show) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{
        width: '100%', maxWidth: '400px', background: '#111', borderRadius: '24px',
        padding: '30px', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.8)', textAlign: 'center'
      }}>
        <div style={{ marginBottom: '20px' }}>
          {statusModal.type === 'loading' && <Loader2 size={50} className="spinner" style={{ color: 'var(--accent-color)', margin: '0 auto' }} />}
          {statusModal.type === 'success' && <CheckCircle size={50} style={{ color: '#00e676', margin: '0 auto' }} />}
          {statusModal.type === 'error' && <X size={50} style={{ color: '#ff4757', margin: '0 auto' }} />}
        </div>
        
        <h2 style={{ fontSize: '1.4rem', marginBottom: '25px', color: 'white' }}>{statusModal.title}</h2>
        
        <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '15px' }}>
          {statusModal.steps.map((step, i) => (
            <div key={i} style={{ 
              display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px',
              opacity: step.status === 'pending' ? 0.3 : 1,
              transition: 'all 0.3s ease'
            }}>
              {step.status === 'done' ? <CheckCircle size={16} color="#00e676" /> : 
               step.status === 'active' ? <Loader2 size={16} className="spinner" color="var(--accent-color)" /> :
               step.status === 'error' ? <X size={16} color="#ff4757" /> :
               <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }} />}
              <span style={{ fontSize: '0.9rem', color: step.status === 'active' ? 'white' : 'rgba(255,255,255,0.7)' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {statusModal.type !== 'loading' && (
          <button 
            onClick={onClose}
            style={{ 
              marginTop: '25px', width: '100%', padding: '12px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
              fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            Cerrar
          </button>
        )}
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
