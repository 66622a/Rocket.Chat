import type { IRoom, RoomType, IUser, AtLeast, ValueOf, ISubscription } from '@rocket.chat/core-typings';
import { isRoomFederated } from '@rocket.chat/core-typings';
import { FlowRouter } from 'meteor/kadira:flow-router';
import type { RouteOptions } from 'meteor/kadira:flow-router';

import { hasPermission } from '../../../app/authorization/client';
import { ChatRoom, ChatSubscription } from '../../../app/models/client';
import { settings } from '../../../app/settings/client';
import { openRoom } from '../../../app/ui-utils/client/lib/openRoom';
import type {
	RoomSettingsEnum,
	RoomMemberActions,
	UiTextContext,
	IRoomTypeConfig,
	IRoomTypeClientDirectives,
	RoomIdentification,
} from '../../../definition/IRoomTypeConfig';
import { RoomCoordinator } from '../../../lib/rooms/coordinator';
import { roomExit } from './roomExit';

class RoomCoordinatorClient extends RoomCoordinator {
	add(roomConfig: IRoomTypeConfig, directives: Partial<IRoomTypeClientDirectives>): void {
		this.addRoomType(roomConfig, {
			allowRoomSettingChange(_room: Partial<IRoom>, _setting: ValueOf<typeof RoomSettingsEnum>): boolean {
				return true;
			},
			allowMemberAction(
				_room: Partial<IRoom>,
				_action: ValueOf<typeof RoomMemberActions>,
				_showingUserId: IUser['_id'],
				_userSubscription?: ISubscription,
			): boolean {
				return false;
			},
			roomName(_room: AtLeast<IRoom, '_id' | 'name' | 'fname' | 'prid'>): string {
				return '';
			},
			isGroupChat(_room: Partial<IRoom>): boolean {
				return false;
			},
			getUiText(_context: ValueOf<typeof UiTextContext>): string {
				return '';
			},
			condition(): boolean {
				return true;
			},
			getAvatarPath(_room): string {
				return '';
			},
			getIcon(_room: Partial<IRoom>): IRoomTypeConfig['icon'] {
				return this.config.icon;
			},
			findRoom(_identifier: string): IRoom | undefined {
				return undefined;
			},
			showJoinLink(_roomId: string): boolean {
				return false;
			},
			isLivechatRoom(): boolean {
				return false;
			},
			canSendMessage(rid: string): boolean {
				return ChatSubscription.find({ rid }).count() > 0;
			},
			...directives,
			config: roomConfig,
		});
	}

	protected addRoute(path: string, routeConfig: RouteOptions): void {
		super.addRoute(path, { ...routeConfig, triggersExit: [roomExit] });
	}

	getRoomDirectives(roomType: string): IRoomTypeClientDirectives | undefined {
		return this.roomTypes[roomType]?.directives as IRoomTypeClientDirectives;
	}

	getRoomTypeById(rid: string): RoomType | undefined {
		const room = ChatRoom.findOne({ _id: rid, t: { $exists: true, $ne: null as any } }, { fields: { t: 1 } });
		return room?.t;
	}

	getRoomDirectivesById(rid: string): IRoomTypeClientDirectives | undefined {
		const roomType = this.getRoomTypeById(rid);
		if (roomType) {
			return this.getRoomDirectives(roomType);
		}
	}

	getRoomTypeConfigById(rid: string): IRoomTypeConfig | undefined {
		const roomType = this.getRoomTypeById(rid);
		if (roomType) {
			return this.getRoomTypeConfig(roomType);
		}
	}

	openRoom(type: RoomType, name: string, render = true): void {
		openRoom(type, name, render);
	}

	getIcon(room: Partial<IRoom>): IRoomTypeConfig['icon'] {
		return room?.t && this.getRoomDirectives(room.t)?.getIcon(room);
	}

	openRouteLink(roomType: RoomType, subData: RoomIdentification, queryParams?: Record<string, string>): void {
		const config = this.getRoomTypeConfig(roomType);
		if (!config?.route) {
			return;
		}

		let routeData = {};
		if (config.route.link) {
			routeData = config.route.link(subData);
		} else if (subData?.name) {
			routeData = {
				name: subData.name,
			};
		} else {
			return;
		}

		FlowRouter.go(config.route.name, routeData, queryParams);
	}

	isLivechatRoom(roomType: string): boolean {
		return Boolean(this.getRoomDirectives(roomType)?.isLivechatRoom());
	}

	getRoomName(roomType: string, roomData: AtLeast<IRoom, '_id' | 'name' | 'fname' | 'prid'>): string {
		return this.getRoomDirectives(roomType)?.roomName(roomData) ?? '';
	}

	readOnly(rid: string, user: AtLeast<IUser, 'username'>): boolean {
		const fields = {
			ro: 1,
			t: 1,
			...(user && { muted: 1, unmuted: 1 }),
		};
		const room = ChatRoom.findOne({ _id: rid }, { fields });
		if (!room) {
			return false;
		}

		const directives = this.getRoomDirectives(room.t);
		if (directives?.readOnly) {
			return directives.readOnly(rid, user);
		}

		if (!user?.username) {
			return Boolean(room.ro);
		}

		if (!room) {
			return false;
		}

		if (Array.isArray(room.muted) && room.muted.indexOf(user.username) !== -1) {
			return true;
		}

		if (room.ro) {
			if (Array.isArray(room.unmuted) && room.unmuted.indexOf(user.username) !== -1) {
				return false;
			}

			if (hasPermission('post-readonly', room._id)) {
				return false;
			}

			return true;
		}

		return false;
	}

	// #ToDo: Move this out of the RoomCoordinator
	archived(rid: string): boolean {
		const room = ChatRoom.findOne({ _id: rid }, { fields: { archived: 1 } });
		return Boolean(room?.archived);
	}

	verifyCanSendMessage(rid: string): boolean {
		const room = ChatRoom.findOne({ _id: rid }, { fields: { t: 1, federated: 1 } });
		if (!room?.t) {
			return false;
		}
		if (!this.getRoomDirectives(room.t)?.canSendMessage(rid)) {
			return false;
		}
		if (isRoomFederated(room)) {
			return settings.get('Federation_Matrix_enabled');
		}
		return true;
	}

	getSortedTypes(): Array<{ config: IRoomTypeConfig; directives: IRoomTypeClientDirectives }> {
		return this.roomTypesOrder
			.sort((a, b) => a.order - b.order)
			.map((type) => this.roomTypes[type.identifier] as { config: IRoomTypeConfig; directives: IRoomTypeClientDirectives })
			.filter((type) => type.directives.condition());
	}
}

export const roomCoordinator = new RoomCoordinatorClient();
