const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cron = require('node-cron');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// ======== REGISTER DEVICE TOKEN ========
app.post('/register-token', async (req, res) => {
  const { userId, token, role } = req.body;

  if (!userId || !token) {
    return res.status(400).send('Missing userId or token');
  }

  try {
    await admin.firestore().collection('users').doc(userId).set({
      fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
      role: role || 'unknown',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.send('Token registered successfully');
  } catch (error) {
    console.error('Error saving token:', error);
    res.status(500).send('Error saving token');
  }
});

// ======== SEND TO SINGLE USER ========
async function sendToUser(userId, title, body, screen, type = 'GENERAL') {
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const tokens = userDoc.data()?.fcmTokens || [];

  if (!tokens.length) return;

  const message = {
    notification: { title, body },
    android: {
      notification: {
        channelId: 'high_importance_channel' // must match Flutter
      }
    },
    data: { screen, type },
    tokens,
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    console.log(`Notification sent to user ${userId}:`, response.successCount);
  } catch (err) {
    console.error('Error sending user notification:', err);
  }
}

// ======== SEND TO TOPIC ========
async function sendToTopic(topic, title, body, screen, type = 'GENERAL') {
  const message = {
    notification: { title, body },
    data: { screen, type },
    topic,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`Notification sent to topic ${topic}:`, response);
  } catch (err) {
    console.error('Error sending topic notification:', err);
  }
}

// ======== SEND TO MULTIPLE USERS ========
async function sendToUsers(userIds, title, body, screen, type = 'GENERAL') {
  for (const userId of userIds) {
    await sendToUser(userId, title, body, screen, type);
  }
}

// ======== API: SEND NOTIFICATION TO SINGLE USER ========
app.post('/send-to-user', async (req, res) => {
  const { userId, title, body, screen, type } = req.body;
  if (!userId || !title || !body) return res.status(400).send('Missing fields');
  await sendToUser(userId, title, body, screen || 'HomeScreen', type);
  res.send('Notification sent to user');
});

// ======== API: SEND NOTIFICATION TO TOPIC ========
app.post('/send-to-topic', async (req, res) => {
  const { topic, title, body, screen, type } = req.body;
  if (!topic || !title || !body) return res.status(400).send('Missing fields');
  await sendToTopic(topic, title, body, screen || 'HomeScreen', type);
  res.send('Notification sent to topic');
});

// ======== API: SEND NOTIFICATION TO MULTIPLE USERS ========
app.post('/send-to-users', async (req, res) => {
  const { userIds, title, body, screen, type } = req.body;
  if (!userIds || !title || !body) return res.status(400).send('Missing fields');
  await sendToUsers(userIds, title, body, screen || 'HomeScreen', type);
  res.send('Notification sent to multiple users');
});

// ======== SCHEDULED / REMINDER NOTIFICATIONS ========
// Example: daily at 9:00 AM UTC
cron.schedule('0 9 * * *', async () => {
  console.log('Sending daily reminder to all freelancers...');
  await sendToTopic('freelancers', 'Good Morning!', 'Check your daily updates', 'HomeScreen', 'DAILY_REMINDER');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
