import { Meteor } from 'meteor/meteor';
import type { ServerMethods } from '@rocket.chat/ui-contexts';

import { Rooms } from '../../models/server';
import { hasPermissionAsync } from '../../authorization/server/functions/hasPermission';
import { settings } from '../../settings/server';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		removeSlackBridgeChannelLinks(): { message: string; params: unknown[] };
	}
}

Meteor.methods<ServerMethods>({
	async removeSlackBridgeChannelLinks() {
		const user = Meteor.user();
		if (!user) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'removeSlackBridgeChannelLinks',
			});
		}

		if (!(await hasPermissionAsync(user._id, 'remove-slackbridge-links'))) {
			throw new Meteor.Error('error-not-authorized', 'Not authorized', {
				method: 'removeSlackBridgeChannelLinks',
			});
		}

		if (settings.get('SlackBridge_Enabled') !== true) {
			throw new Meteor.Error('SlackBridge_disabled');
		}

		Rooms.unsetAllImportIds();

		return {
			message: 'Slackbridge_channel_links_removed_successfully',
			params: [],
		};
	},
});
