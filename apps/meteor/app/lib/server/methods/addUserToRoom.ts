import type { ServerMethods } from '@rocket.chat/ui-contexts';
import { Meteor } from 'meteor/meteor';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		addUserToRoom(data: { rid: string; username: string }): void;
	}
}

Meteor.methods<ServerMethods>({
	addUserToRoom(data) {
		return Meteor.call('addUsersToRoom', {
			rid: data.rid,
			users: [data.username],
		});
	},
});
