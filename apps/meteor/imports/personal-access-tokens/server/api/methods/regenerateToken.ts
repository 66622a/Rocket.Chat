import { Meteor } from 'meteor/meteor';
import type { ServerMethods } from '@rocket.chat/ui-contexts';

import { hasPermissionAsync } from '../../../../../app/authorization/server/functions/hasPermission';
import { Users } from '../../../../../app/models/server';
import { twoFactorRequired } from '../../../../../app/2fa/server/twoFactorRequired';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		'personalAccessTokens:regenerateToken'(params: { tokenName: string }): string;
	}
}

Meteor.methods<ServerMethods>({
	'personalAccessTokens:regenerateToken': twoFactorRequired(async function ({ tokenName }) {
		const uid = Meteor.userId();
		if (!uid) {
			throw new Meteor.Error('not-authorized', 'Not Authorized', {
				method: 'personalAccessTokens:regenerateToken',
			});
		}
		if (!(await hasPermissionAsync(uid, 'create-personal-access-tokens'))) {
			throw new Meteor.Error('not-authorized', 'Not Authorized', {
				method: 'personalAccessTokens:regenerateToken',
			});
		}

		const tokenExist = Users.findPersonalAccessTokenByTokenNameAndUserId({
			userId: uid,
			tokenName,
		});
		if (!tokenExist) {
			throw new Meteor.Error('error-token-does-not-exists', 'Token does not exist', {
				method: 'personalAccessTokens:regenerateToken',
			});
		}

		Meteor.call('personalAccessTokens:removeToken', { tokenName });
		return Meteor.call('personalAccessTokens:generateToken', {
			tokenName,
			bypassTwoFactor: tokenExist.bypassTwoFactor,
		});
	}),
});
