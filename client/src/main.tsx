import { createRoot } from "react-dom/client";
import App from "./App";
import { trackAppHeight } from "./lib/app-height";
import "leaflet/dist/leaflet.css";
import "./index.css";

trackAppHeight();

createRoot(document.getElementById("root")!).render(<App />);
