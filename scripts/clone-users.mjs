// Clona los jugadores y sus contraseñas de una porra a otra dentro del mismo
// proyecto de Firebase. Se usa para arrancar una edición nueva (p. ej. la
// Champions) reaprovechando los usuarios de la edición anterior (el Mundial),
// sin arrastrar apuestas ni crónicas.
//
// Uso:
//   node scripts/clone-users.mjs <grupoOrigen> <grupoDestino>
//   node scripts/clone-users.mjs papisllor papisllor-ucl2627
//
// Copia (no borra) config/users y userPasswords. Es idempotente.

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDI8krdmNN46J1gmsfSYpntsDD-iKP0ii8",
  authDomain: "mundialisimo.firebaseapp.com",
  projectId: "mundialisimo",
  storageBucket: "mundialisimo.firebasestorage.app",
  messagingSenderId: "375614678452",
  appId: "1:375614678452:web:51b4da8fc858d6452abee1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("Uso: node scripts/clone-users.mjs <grupoOrigen> <grupoDestino>");
  process.exit(1);
}

async function main() {
  console.log(`Clonando jugadores groups/${from} → groups/${to} ...`);

  const usersSnap = await getDoc(doc(db, "groups", from, "config", "users"));
  if (usersSnap.exists()) {
    await setDoc(doc(db, "groups", to, "config", "users"), usersSnap.data());
    console.log("  ✓ config/users");
  } else {
    console.log("  – config/users no existe en el origen, omitido");
  }

  const pwSnap = await getDocs(collection(db, "groups", from, "userPasswords"));
  let n = 0;
  for (const d of pwSnap.docs) {
    await setDoc(doc(db, "groups", to, "userPasswords", d.id), d.data());
    n++;
  }
  console.log(`  ✓ userPasswords: ${n} documentos`);

  console.log("Listo. Las apuestas y crónicas NO se copian: cada edición empieza en blanco.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
