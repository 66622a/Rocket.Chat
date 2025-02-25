import { AppsEngineException } from '@rocket.chat/apps-engine/definition/exceptions';
import { Meteor } from 'meteor/meteor';
import type { IUser, IRoom } from '@rocket.chat/core-typings';
import { Team } from '@rocket.chat/core-services';

import { AppEvents, Apps } from '../../../../ee/server/apps';
import { callbacks } from '../../../../lib/callbacks';
import { Messages, Rooms, Subscriptions, Users } from '../../../models/server';
import { roomCoordinator } from '../../../../server/lib/rooms/roomCoordinator';
import { RoomMemberActions } from '../../../../definition/IRoomTypeConfig';

export const addUserToRoom = async function (
	rid: string,
	user: Pick<IUser, '_id' | 'username'> | string,
	inviter?: Pick<IUser, '_id' | 'username'>,
	silenced?: boolean,
): Promise<boolean | undefined> {
	const now = new Date();
	const room: IRoom = Rooms.findOneById(rid);

	const userToBeAdded = typeof user !== 'string' ? user : Users.findOneByUsername(user.replace('@', ''));
	const roomDirectives = roomCoordinator.getRoomDirectives(room.t);
	if (
		!roomDirectives?.allowMemberAction(room, RoomMemberActions.JOIN, userToBeAdded._id) &&
		!roomDirectives?.allowMemberAction(room, RoomMemberActions.INVITE, userToBeAdded._id)
	) {
		return;
	}

	try {
		callbacks.run('federation.beforeAddUserToARoom', { user, inviter }, room);
	} catch (error) {
		throw new Meteor.Error((error as any)?.message);
	}

	// Check if user is already in room
	const subscription = Subscriptions.findOneByRoomIdAndUserId(rid, userToBeAdded._id);
	if (subscription) {
		return;
	}

	try {
		await Apps.triggerEvent(AppEvents.IPreRoomUserJoined, room, userToBeAdded, inviter);
	} catch (error: any) {
		if (error.name === AppsEngineException.name) {
			throw new Meteor.Error('error-app-prevented', error.message);
		}

		throw error;
	}

	if (room.t === 'c' || room.t === 'p' || room.t === 'l') {
		// Add a new event, with an optional inviter
		callbacks.run('beforeAddedToRoom', { user: userToBeAdded, inviter }, room);

		// Keep the current event
		callbacks.run('beforeJoinRoom', userToBeAdded, room);
	}

	await Apps.triggerEvent(AppEvents.IPreRoomUserJoined, room, userToBeAdded, inviter).catch((error) => {
		if (error.name === AppsEngineException.name) {
			throw new Meteor.Error('error-app-prevented', error.message);
		}

		throw error;
	});

	Subscriptions.createWithRoomAndUser(room, userToBeAdded, {
		ts: now,
		open: true,
		alert: true,
		unread: 1,
		userMentions: 1,
		groupMentions: 0,
	});

	if (!silenced) {
		if (inviter) {
			const extraData = {
				ts: now,
				u: {
					_id: inviter._id,
					username: inviter.username,
				},
			};
			if (room.teamMain) {
				Messages.createUserAddedToTeamWithRoomIdAndUser(rid, userToBeAdded, extraData);
			} else {
				Messages.createUserAddedWithRoomIdAndUser(rid, userToBeAdded, extraData);
			}
		} else if (room.prid) {
			Messages.createUserJoinWithRoomIdAndUserDiscussion(rid, userToBeAdded, { ts: now });
		} else if (room.teamMain) {
			Messages.createUserJoinTeamWithRoomIdAndUser(rid, userToBeAdded, { ts: now });
		} else {
			Messages.createUserJoinWithRoomIdAndUser(rid, userToBeAdded, { ts: now });
		}
	}

	if (room.t === 'c' || room.t === 'p') {
		process.nextTick(function () {
			// Add a new event, with an optional inviter
			callbacks.run('afterAddedToRoom', { user: userToBeAdded, inviter }, room);

			// Keep the current event
			callbacks.run('afterJoinRoom', userToBeAdded, room);

			void Apps.triggerEvent(AppEvents.IPostRoomUserJoined, room, userToBeAdded, inviter);
		});
	}

	if (room.teamMain && room.teamId) {
		// if user is joining to main team channel, create a membership
		await Team.addMember(inviter || userToBeAdded, userToBeAdded._id, room.teamId);
	}

	return true;
};
