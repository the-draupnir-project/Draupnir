// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// For the love of god keep this in alphabetical order please.
export * from "./Client/Pagination/MatrixPaginator";
export * from "./Client/Pagination/PaginationChunk";
export * from "./Client/Pagination/PaginationIteration";
export * from "./Client/Pagination/PaginationOptions";
export * from "./Client/Pagination/PaginationSession";
export * from "./Client/Pagination/PaginationToken";
export * from "./Client/Pagination/StandardPaginationIterator";

export * from "./Client/ClientCapabilityNegotiation";
export * from "./Client/ClientPlatform";
export * from "./Client/PowerLevelsMirror";
export * from "./Client/RoomBanner";
export * from "./Client/RoomCreator";
export * from "./Client/RoomEventFilter";
export * from "./Client/RoomEventRedacter";
export * from "./Client/RoomEventRelations";
export * from "./Client/RoomInviter";
export * from "./Client/RoomJoiner";
export * from "./Client/RoomKicker";
export * from "./Client/RoomMessages";
export * from "./Client/RoomMessageSender";
export * from "./Client/RoomResolver";
export * from "./Client/RoomStateGetter";

export * from "./Client/RoomStateEventSender";
export * from "./Client/RoomUnbanner";

export * from "./ClientManagement/Client";
export * from "./ClientManagement/ClientRooms";
export * from "./ClientManagement/ClientsInRoomMap";
export * from "./ClientManagement/ConstantPeriodBatch";
export * from "./ClientManagement/JoinedRoomsRevision";
export * from "./ClientManagement/RoomEventAcivity";
export * from "./ClientManagement/RoomPauser";
export * from "./ClientManagement/StandardClientRooms";
export * from "./ClientManagement/TimedGate";

export * from "./Config/ConfigDescription";
export * from "./Config/ConfigMirror";
export * from "./Config/ConfigParseError";
export * from "./Config/describeConfig";
export * from "./Config/PersistentConfigData";

export * from "./Interface/Action";
export * from "./Interface/ActionException";
export * from "./Interface/Deduplicator";
export * from "./Interface/InternedInstanceFactory";
export * from "./Interface/KeyedBatchQueue";
export * from "./Interface/Lifetime";
export * from "./Interface/LoggableConfig";
export * from "./Interface/MatrixException";
export * from "./Interface/MultipleErrors";
export * from "./Interface/PersistentMatrixData";
export * from "./Interface/RoomUpdateError";
export * from "./Interface/SchemedMatrixData";
export * from "./Interface/SemanticType";
export * from "./Interface/SimpleChangeType";
export * from "./Interface/Static";
export * from "./Interface/Task";
export * from "./Interface/Value";

export * from "./Logging/Logger";

export * from "./MatrixTypes/SynapseAdmin/APIBodies";

export * from "./MatrixTypes/CreateRoom";
export * from "./MatrixTypes/DefaultEventDecoder";
export * from "./MatrixTypes/EventDecoder";
export * from "./MatrixTypes/Events";
export * from "./MatrixTypes/JoinRules";
export * from "./MatrixTypes/MembershipEvent";
export * from "./MatrixTypes/PermalinkSchema";
export * from "./MatrixTypes/PolicyEvents";
export * from "./MatrixTypes/PowerLevels";
export * from "./MatrixTypes/ReactionEvent";
export * from "./MatrixTypes/Redaction";
export * from "./MatrixTypes/RoomMessage";
export * from "./MatrixTypes/ServerACL";
export * from "./MatrixTypes/ServerACLBuilder";
export * from "./MatrixTypes/StringlyTypedMatrix";
export * from "./MatrixTypes/SynapseReport";
export * from "./MatrixTypes/Tombstone";

export * from "./Membership/MembershipChange";
export * from "./Membership/MembershipRevision";
export * from "./Membership/MembershipRevisionIssuer";
export * from "./Membership/RoomMembershipManager";
export * from "./Membership/RoomStateMembershipRevisionIssuer";
export * from "./Membership/SetMembershipRevision";
export * from "./Membership/SetMembershipRevisionIssuer";
export * from "./Membership/SetRoomMembership";
export * from "./Membership/StandardRoomMembershipRevision";
export * from "./Membership/StandardRoomMembershipRevisionIssuer";
export * from "./Membership/StandardSetRoomMembership";

export * from "./MembershipPolicies/MembershipPolicyRevision";
export * from "./MembershipPolicies/SetMembershipPolicyRevisionIssuer";
export * from "./MembershipPolicies/StandardSetMembershipPolicyRevision";

export * from "./PolicyList/PolicyListRevision";
export * from "./PolicyList/PolicyListRevisionIssuer";
export * from "./PolicyList/PolicyRoomEditor";
export * from "./PolicyList/PolicyRoomManger";
export * from "./PolicyList/PolicyRule";
export * from "./PolicyList/PolicyRuleChange";
export * from "./PolicyList/Revision";
export * from "./PolicyList/RoomStatePolicyListRevisionIssuer";
export * from "./PolicyList/StandardPolicyListRevision";
export * from "./PolicyList/StandardPolicyRoomEditor";
export * from "./PolicyList/StandardPolicyRoomRevision";
export * from "./PolicyList/StandardPolicyRoomRevisionIssuer";

export * from "./Projection/Projection";
export * from "./Projection/ProjectionNode";

export * from "./Protection/Capability/StandardCapability/CapabilityMethodSchema";
export * from "./Protection/Capability/StandardCapability/EventConsequences";
export * from "./Protection/Capability/StandardCapability/RoomSetResult";
export * from "./Protection/Capability/StandardCapability/SimulatedEventConsequences";
export * from "./Protection/Capability/StandardCapability/SimulatedUserConsequences";
export * from "./Protection/Capability/StandardCapability/StandardEventConsequences";
export * from "./Protection/Capability/StandardCapability/StandardUserConsequences";
export * from "./Protection/Capability/StandardCapability/UserConsequences";

export * from "./Protection/Capability/CapabilityContextGlue";
export * from "./Protection/Capability/CapabilityInterface";
export * from "./Protection/Capability/CapabilityProvider";
export * from "./Protection/Capability/CapabilityRenderer";
export * from "./Protection/Capability/CapabilitySet";

export * from "./Protection/HandleRegistry/HandleDescription";
export * from "./Protection/HandleRegistry/HandleRegistry";
export * from "./Protection/HandleRegistry/StandardHandleRegistryDescription";
export * from "./Protection/HandleRegistry/StandardHandleRegistry";
export * from "./Protection/HandleRegistry/StandardHandleRegistryDescription";

export * from "./Protection/PolicyListConfig/MjolnirWatchedListsEvent";
export * from "./Protection/PolicyListConfig/MjolnirPolicyRoomsConfig";
export * from "./Protection/PolicyListConfig/MjolnirPolicyRoomsDescription";
export * from "./Protection/PolicyListConfig/PolicyListConfig";

export * from "./Protection/ProtectedRoomsConfig/FakeProtectedRoomsConfig";
export * from "./Protection/ProtectedRoomsConfig/MjolnirProtectedRoomsDescription";
export * from "./Protection/ProtectedRoomsConfig/MjolnirProtectedRoomsEvent";
export * from "./Protection/ProtectedRoomsConfig/ProtectedRoomsConfig";

export * from "./Protection/ProtectedRoomsManager/ProtectedRoomsManager";
export * from "./Protection/ProtectedRoomsManager/StandardProtectedRoomsManager";

export * from "./Protection/ProtectionsConfig/ProtectionCapabilityProviderSetConfig/ProtectionCapabilityProviderSetConfig";
export * from "./Protection/ProtectionsConfig/ProtectionCapabilityProviderSetConfig/StandardProtectionCapabilityProviderSetConfig";

export * from "./Protection/ProtectionsConfig/ProtectionSettingsConfig/MjolnirProtectionSettingsConfig";
export * from "./Protection/ProtectionsConfig/ProtectionSettingsConfig/ProtectionSettingsConfig";

export * from "./Protection/ProtectionsConfig/MjolnirEnabledProtectionsDescription";
export * from "./Protection/ProtectionsConfig/MjolnirEnabledProtectionsEvent";
export * from "./Protection/ProtectionsConfig/ProtectionsConfig";
export * from "./Protection/ProtectionsConfig/StandardProtectionsConfig";

export * from "./Protection/ProtectionsManager/FakeProtectionsManager";
export * from "./Protection/ProtectionsManager/StandardProtectionsManager";
export * from "./Protection/ProtectionsManager/ProtectionsManager";

export * from "./Protection/StandardProtections/MemberBanSynchronisation/MemberBanIntentProjection";
export * from "./Protection/StandardProtections/MemberBanSynchronisation/MemberBanIntentProjectionNode";
export * from "./Protection/StandardProtections/MemberBanSynchronisation/MemberBanSynchronisation";

export * from "./Protection/StandardProtections/ServerBanSynchronisation/ServerBanSynchronisationCapability";
export * from "./Protection/StandardProtections/ServerBanSynchronisation/ServerACLSynchronisationCapability";
export * from "./Protection/StandardProtections/ServerBanSynchronisation/ServerBanIntentProjection";
export * from "./Protection/StandardProtections/ServerBanSynchronisation/ServerBanIntentProjectionNode";
export * from "./Protection/StandardProtections/ServerBanSynchronisation/ServerBanSynchronisation";
export * from "./Protection/StandardProtections/ServerBanSynchronisation/SimulatedServerBanSynchronisationCapability";

export * from "./Protection/WatchedPolicyRooms/HashReverser/SHA256HashReverser";

export * from "./Protection/WatchedPolicyRooms/StandardWatchedPolicyRooms";
export * from "./Protection/WatchedPolicyRooms/WatchedPolicyRooms";

export * from "./Protection/AccessControl";
export * from "./Protection/DescriptionMeta";

export * from "./Protection/DirectPropagationPolicyListRevisionIssuer";
export * from "./Protection/ProtectedRoomsSet";
export * from "./Protection/Protection";
export * from "./Protection/ProtectionHandles";

export * from "./Reporting/EventReport";

export * from "./SafeMatrixEvents/EventMixinExtraction/EventMixinDescription";
export * from "./SafeMatrixEvents/EventMixinExtraction/EventMixinExtraction";
export * from "./SafeMatrixEvents/EventMixinExtraction/StandardMixinExtractor";

export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/DefaultMixinExtractor";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/ExtensibleTextMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/MentionsMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/NewContentMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/RoomMessageBodyMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/RoomMessageFileMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/RoomMessageFormatedBodyMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/RoomMessageMediaURLMixin";
export * from "./SafeMatrixEvents/MatrixEventMixinDescriptions/RoomMessageThumbnailURLMixin";

export * from "./SafeMatrixEvents/hasOwn";
export * from "./SafeMatrixEvents/SafeMembershipEvent";
export * from "./SafeMatrixEvents/UndecodableEventContent";
export * from "./SafeMatrixEvents/UnsafeEvent";

export * from "./StateTracking/DeclareRoomState";
export * from "./StateTracking/EventBatch";
export * from "./StateTracking/RoomStateBackingStore";
export * from "./StateTracking/SetRoomState";
export * from "./StateTracking/StandardRoomStateRevision";
export * from "./StateTracking/StandardRoomStateRevisionIssuer";
export * from "./StateTracking/StandardSetRoomState";
export * from "./StateTracking/StateChangeType";
export * from "./StateTracking/StateRevisionIssuer";
export * from "./TestUtilities/EventGeneration";
