// Compatibility shim — components that import useLang get lang from AppCtx
import { useApp } from '../App.jsx';

export const useLang = () => {
  const { lang, toggleLang, t } = useApp();
  return { lang, toggle: toggleLang, t };
};
