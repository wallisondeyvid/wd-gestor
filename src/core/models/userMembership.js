import mongoose from 'mongoose';

const userMembershipSchema = new mongoose.Schema({
	user_id: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		index: true,
	},
	unidade_id: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Unidade',
		required: true,
		index: true,
	},
	papel_contextual: {
		type: String,
		enum: ['gestor', 'user'],
		required: true,
	},
	status: {
		type: String,
		enum: ['active', 'inactive'],
		default: 'active',
		index: true,
	},
	funcionario_id: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Funcionario',
		default: null,
	},
	origem: {
		type: String,
		trim: true,
		default: '',
		maxlength: 64,
	},
}, {
	timestamps: true,
	collection: 'user_memberships',
});

userMembershipSchema.index(
	{ user_id: 1, unidade_id: 1 },
	{ unique: true, name: 'uk_user_membership_user_unidade' }
);

userMembershipSchema.index(
	{ user_id: 1, status: 1 },
	{ name: 'idx_user_membership_user_status' }
);

userMembershipSchema.index(
	{ unidade_id: 1, status: 1, papel_contextual: 1 },
	{ name: 'idx_user_membership_unidade_status_papel' }
);

userMembershipSchema.index(
	{ unidade_id: 1, funcionario_id: 1 },
	{
		unique: true,
		name: 'uk_user_membership_unidade_funcionario',
		partialFilterExpression: { funcionario_id: { $type: 'objectId' } },
	}
);

const UserMembership = mongoose.models.UserMembership || mongoose.model('UserMembership', userMembershipSchema);
export default UserMembership;
