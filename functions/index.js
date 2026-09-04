const { beforeUserCreated, beforeUserDeleted } = require("firebase-functions/v2/identity");
const { HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const MAX_ACTIVE_USERS = 3;
const LIMIT_DOC = "config/limiteUsuarios";

async function contarUsuariosGoogle() {
  const auth = require("firebase-admin/auth").getAuth();
  let pageToken;
  let total = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.filter((user) =>
      user.providerData.some((provider) => provider.providerId === "google.com")
    ).length;
    pageToken = page.pageToken;
  } while (pageToken);

  return total;
}

exports.limitarUsuariosGoogle = beforeUserCreated(async (event) => {
  const db = getFirestore();
  const limitRef = db.doc(LIMIT_DOC);
  const authCount = await contarUsuariosGoogle();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(limitRef);
    const storedCount = Number(snapshot.data()?.count || 0);
    const currentCount = Math.max(authCount, storedCount);

    if (currentCount >= MAX_ACTIVE_USERS) {
      throw new HttpsError(
        "resource-exhausted",
        "O limite de 3 usuários ativos já foi atingido."
      );
    }

    transaction.set(limitRef, {
      count: currentCount + 1,
      updatedAt: new Date(),
    }, { merge: true });
  });
});

exports.removerUsuarioGoogleDoLimite = beforeUserDeleted(async (event) => {
  if (!event.data?.providerData?.some((provider) => provider.providerId === "google.com")) return;

  const db = getFirestore();
  const limitRef = db.doc(LIMIT_DOC);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(limitRef);
    const count = Number(snapshot.data()?.count || 0);
    transaction.set(limitRef, {
      count: Math.max(0, count - 1),
      updatedAt: new Date(),
    }, { merge: true });
  });
});
