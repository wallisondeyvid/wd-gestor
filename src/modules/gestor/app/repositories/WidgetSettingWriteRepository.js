import WidgetSetting from '#models/widgetSetting.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findWidgetSettingsFeedbackLeanRepo({ unitScope }) {
  const WidgetSettingModel = resolveModel({
    name: WidgetSetting.modelName || 'WidgetSetting',
    schema: WidgetSetting.schema,
    unitScope,
  });

  return WidgetSettingModel.find({ widget: 'feedback' }).lean();
}

export async function updateWidgetSettingsFeedbackModuleEnabledUpsertRepo({ unitScope, moduleId, enabled }) {
  const WidgetSettingModel = resolveModel({
    name: WidgetSetting.modelName || 'WidgetSetting',
    schema: WidgetSetting.schema,
    unitScope,
  });

  return WidgetSettingModel.updateOne(
    { widget: 'feedback', module: moduleId },
    { $set: { enabled } },
    { upsert: true }
  );
}