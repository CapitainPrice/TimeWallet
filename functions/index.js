const { beforeUserCreated } = require("firebase-functions/v2/identity");
const { HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const MAX_ACTIVE_USERS = 3;
const LIMIT_DOC = "config/limiteUsuarios";

exports.limitarUsuariosGoogle = beforeUserCreated(async (event) => {
  const db = getFirestore();
  const limitRef = db.doc(LIMIT_DOC);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(limitRef);
    const currentCount = Number(snapshot.data()?.count || 0);

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
