import { Meteor } from 'meteor/meteor';
import { Match, check } from 'meteor/check';
import { isUserFederated } from '@rocket.chat/core-typings';
import type { ServerMethods } from '@rocket.chat/ui-contexts';

import { hasPermissionAsync } from '../../../authorization/server/functions/hasPermission';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		setAdminStatus(userId: string, admin?: boolean): void;
	}
}

Meteor.methods<ServerMethods>({
	async setAdminStatus(userId, admin) {
		check(userId, String);
		check(admin, Match.Optional(Boolean));

		const uid = Meteor.userId();

		if (!uid) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', { method: 'setAdminStatus' });
		}

		if ((await hasPermissionAsync(uid, 'assign-admin-role')) !== true) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', { method: 'setAdminStatus' });
		}

		const user = Meteor.users.findOne({ _id: userId }, { fields: { username: 1, federated: 1 } });
		if (!user || isUserFederated(user)) {
			throw new Meteor.Error('error-not-allowed', 'Federated Users cant be admins', { method: 'setAdminStatus' });
		}

		if (admin) {
			return Meteor.call('authorization:addUserToRole', 'admin', user?.username);
		}
		return Meteor.call('authorization:removeUserFromRole', 'admin', user?.username);
	},
});
