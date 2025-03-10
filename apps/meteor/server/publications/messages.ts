import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Messages } from '@rocket.chat/models';
import type { ServerMethods } from '@rocket.chat/ui-contexts';
import type { IMessage, IRoom } from '@rocket.chat/core-typings';

import { canAccessRoomIdAsync } from '../../app/authorization/server/functions/canAccessRoom';
import { Messages as MessagesSync } from '../../app/models/server';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		'messages/get': (
			rid: IRoom['_id'],
			options: { lastUpdate?: Date; latestDate?: Date; oldestDate?: Date; inclusive?: boolean; count?: number; unreads?: boolean },
		) => Promise<{
			updated: IMessage[];
			deleted: IMessage[];
		}>;
	}
}

Meteor.methods<ServerMethods>({
	async 'messages/get'(rid, { lastUpdate, latestDate = new Date(), oldestDate, inclusive = false, count = 20, unreads = false }) {
		check(rid, String);

		const fromId = Meteor.userId();

		if (!fromId) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'messages/get',
			});
		}

		if (!rid) {
			throw new Meteor.Error('error-invalid-room', 'Invalid room', { method: 'messages/get' });
		}

		if (!(await canAccessRoomIdAsync(rid, fromId))) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', {
				method: 'messages/get',
			});
		}

		const options = {
			sort: {
				ts: -1,
			},
		};

		if (lastUpdate instanceof Date) {
			return {
				updated: await Messages.findForUpdates(rid, lastUpdate, {
					sort: {
						ts: -1,
					},
				}).toArray(),
				deleted: MessagesSync.trashFindDeletedAfter(lastUpdate, { rid }, { ...options, fields: { _id: 1, _deletedAt: 1 } }).fetch(),
			};
		}

		return Meteor.call('getChannelHistory', {
			rid,
			latest: latestDate,
			oldest: oldestDate,
			inclusive,
			count,
			unreads,
		});
	},
});
