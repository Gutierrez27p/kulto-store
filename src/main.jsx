import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Protección contra traductores automáticos del navegador y extensiones que
// cambian la página por fuera: sin esto, React se rompe (pantalla en blanco)
// cuando intenta actualizar un texto que el traductor ya movió de lugar.
if (typeof Node === "function" && Node.prototype) {
  const origRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) return child;
    return origRemove.apply(this, arguments);
  };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, ref) {
    if (ref && ref.parentNode !== this) return newNode;
    return origInsert.apply(this, arguments);
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
