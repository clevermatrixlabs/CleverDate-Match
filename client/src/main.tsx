import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Add process polyfill for client-side
window.process = window.process || { env: {} };

createRoot(document.getElementById("root")!).render(<App />);