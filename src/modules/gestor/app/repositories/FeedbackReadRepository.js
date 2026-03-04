import Feedback from '#models/feedback.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function createFeedbackRepo({ unitScope, data }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.create(data);
}

export async function findFeedbackByIdRepo({ unitScope, id }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.findById(id);
}

export async function findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo({ unitScope, filter }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
}

export async function findFeedbackByIdLeanRepo({ unitScope, id }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.findById(id).lean();
}

export async function findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo({ unitScope, filter }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
}

export async function findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope, id, setData }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.findByIdAndUpdate(id, { $set: setData }, { new: true }).lean();
}

export async function findFeedbackByIdAndDeleteLeanRepo({ unitScope, id }) {
  const FeedbackModel = resolveModel({
    name: Feedback.modelName || 'Feedback',
    schema: Feedback.schema,
    unitScope,
  });

  return FeedbackModel.findByIdAndDelete(id).lean();
}