import mongoose from 'mongoose';

const widgetSettingSchema = new mongoose.Schema({
  widget: { type: String, trim: true, required: true, index: true },
  module: { type: String, trim: true, required: true, index: true },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

widgetSettingSchema.index({ widget: 1, module: 1 }, { unique: true });

const WidgetSetting = mongoose.models.WidgetSetting || mongoose.model('WidgetSetting', widgetSettingSchema);
export default WidgetSetting;
