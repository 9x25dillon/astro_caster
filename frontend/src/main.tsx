import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installErrorTelemetry } from "./lib/errorTelemetry";
import "./theme.css";

// Before render: boot-time failures should reach telemetry too.
installErrorTelemetry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
