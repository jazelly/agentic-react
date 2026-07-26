import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import AgenticReact from '@agentic-react/vite';
import { z } from 'zod';
import log1 from './tools/log1.js';

export default defineConfig({
  plugins: [
    react(),
    AgenticReact({
      settingsRoot: process.env.AGENTIC_REACT_E2E_SETTINGS_ROOT,
      customTools: [
        {
          name: 'log1',
          description: 'Log1',
          schema: z.object({
            message: z.string(),
          }),
          clientFunction: log1,
        },
      ],
      toolkit: {
        iconUrl: '/agentic-react-logo.png',
        settings: {
          shortcuts: {
            singleSelect: 'Ctrl+Alt+Shift+S',
            multiSelect: 'Ctrl+Alt+Shift+M',
            toggleToolbox: 'Ctrl+Alt+Shift+A',
            done: 'Enter',
          },
        },
        tuningModal: {
          classNames: {
            surface: 'vite-playground-tuning-surface',
            panel: 'vite-playground-tuning-panel',
            control: 'vite-playground-tuning-control',
          },
          tokens: {
            panelRadius: '14px',
            controlRadius: '10px',
            primaryButtonBackground: '#0f766e',
            primaryButtonColor: '#ffffff',
            panelShadow: '0 24px 72px rgba(15, 118, 110, 0.22)',
          },
          styles: {
            surface: {
              filter: 'drop-shadow(0 18px 40px rgba(15, 118, 110, 0.16))',
            },
            panel: {
              border: '1px solid rgba(15, 118, 110, 0.22)',
            },
            targetTag: {
              background: '#ecfeff',
              color: '#0f766e',
            },
            sectionTitle: {
              color: '#0f766e',
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 51423,
  },
});
