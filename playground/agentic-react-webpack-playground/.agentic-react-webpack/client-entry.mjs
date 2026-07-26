
import {
  __AGENTIC_REACT_BRIDGE_URL__,
  __AGENTIC_REACT_CONFIG__,
} from "../../../packages/core/dist/shared/const.js";
import { BRIDGE_WS_PATH } from "../../../packages/core/dist/shared/protocol.js";

if (typeof window !== 'undefined') {
  const existingAgenticReactConfig = window[__AGENTIC_REACT_CONFIG__] || {};
  window[__AGENTIC_REACT_CONFIG__] = {
    ...existingAgenticReactConfig,
    sourceRoot: existingAgenticReactConfig.sourceRoot || "/Users/jazelly/Desktop/github/my-proj/agentic-react/playground/agentic-react-webpack-playground",
    toolkit: {
      ...(existingAgenticReactConfig.toolkit || {}),
      ...{"tuningModal":{"classNames":{"surface":"webpack-playground-tuning-surface","panel":"webpack-playground-tuning-panel","control":"webpack-playground-tuning-control"},"tokens":{"panelRadius":"12px","controlRadius":"9px","primaryButtonBackground":"#1d4ed8","primaryButtonColor":"#ffffff","panelShadow":"0 24px 72px rgba(29, 78, 216, 0.22)"},"styles":{"surface":{"filter":"drop-shadow(0 18px 40px rgba(29, 78, 216, 0.16))"},"panel":{"border":"1px solid rgba(29, 78, 216, 0.24)"},"targetTag":{"background":"#eff6ff","color":"#1d4ed8"},"sectionTitle":{"color":"#1d4ed8"}}}},
    },
    settings: existingAgenticReactConfig.settings || {"effectiveSettings":{"schemaVersion":1,"shortcuts":{"singleSelect":"Ctrl+Alt+Shift+S","multiSelect":"Ctrl+Alt+Shift+M","toggleToolbox":"Ctrl+Alt+Shift+A","done":"Enter"},"appearance":{"toolboxIcon":null,"toolboxIconUrl":null}},"sources":{"shortcuts":{"singleSelect":"package","multiSelect":"package","toggleToolbox":"package","done":"package"},"appearance":{"toolboxIcon":"package"}},"errors":[],"capability":{"available":true,"token":"iU0ytb5IErWgq7vuuSfwKoX5t1Xu2vHIqkSI28LXcx0"}},
  };

  if (!window[__AGENTIC_REACT_BRIDGE_URL__]) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    window[__AGENTIC_REACT_BRIDGE_URL__] =
      `${protocol}//${window.location.host}${BRIDGE_WS_PATH}`;
  }
}

void import("../../../packages/core/dist/overlay.js");


    const registerTool = (name, handler) => {
      const tryRegister = (attempt = 0) => {
        const registry = window.__AGENTIC_REACT_TOOLS__;
        if (registry?.registerCustomTool) {
          registry.registerCustomTool(name, handler);
          return;
        }
        if (attempt >= 40) {
          console.warn('[agentic-react] Custom tool registration timed out for', name);
          return;
        }
        setTimeout(() => tryRegister(attempt + 1), 50);
      };

      tryRegister();
    };

    
  
