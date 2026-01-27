import mongoose from 'mongoose';

const PortalPushSubscriptionSchema = new mongoose.Schema({
  cond_usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'cond_usuario', index: true },
  email: { type: String, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  user_agent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

PortalPushSubscriptionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const PortalPushSubscription = mongoose.models.portal_push_subscription
  || mongoose.model('portal_push_subscription', PortalPushSubscriptionSchema);

export default PortalPushSubscription;