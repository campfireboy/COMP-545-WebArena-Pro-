const submissions = [];

function sanitizeInput(input = '') {
  return String(input || '').trim();
}

async function submitFeedback(payload = {}) {
  const feedback = {
    id: submissions.length + 1,
    email: sanitizeInput(payload.email),
    message: sanitizeInput(payload.message),
    topic: sanitizeInput(payload.topic || 'general'),
    createdAt: new Date().toISOString()
  };

  if (!feedback.message) {
    throw new Error('Feedback message is required');
  }

  submissions.push(feedback);
  return feedback;
}

module.exports = {
  submitFeedback
};
