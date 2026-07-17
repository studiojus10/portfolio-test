import '../styles/main.css'; // @tailwind layers first…
import '../styles/site.css'; // …then hand-written overrides (preserves cascade)
import { renderNav } from './nav.js';

// ES modules are deferred, so the DOM (including #nav-root) is parsed by now.
renderNav();
