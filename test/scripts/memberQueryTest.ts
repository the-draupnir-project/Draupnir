import { MatrixClient } from "matrix-bot-sdk";

/**
 * This is a test for the response times for various endpoints querying the
 * members in a room so that they can be banned.
 *
 * Below are some results from MatrixHQ using a home connection with only 26Mbps down.
 * Which is probably a major limiting factor of these results given the size just encoding the usernames
 * in MatrixHQ alone.
 *
 * /joined_members: total time elapsed 29.655seconds,  mean time 5931ms,    median time 4744ms
 * /state:          total time elapsed 141.353seconds, mean time 28270.6ms, median time 23354ms
 * /members:        total time elapsed 164.845seconds, mean time 32969ms,   median time 28258ms
 *
 * To run the script use `yarn ts-node -P tsconfig.json test/scripts/memberQueryTest.ts`.
 */
//
const accessToken = "redacted";
const client = new MatrixClient("https://matrix-client.matrix.org", accessToken);
const roomId = "!OGEhHVWSdvArJzumhm:matrix.org";

enum MemberFetchMethod {
    JoinedMembers = "/joined_members",
    Members = "/members",
    State = "/state",
}

const shuffledMethods =
    [MemberFetchMethod.JoinedMembers, MemberFetchMethod.Members, MemberFetchMethod.State]
        .reduce((acc: MemberFetchMethod[], method: MemberFetchMethod) => {
            return [...acc,  ...[...Array(5)].map(_ => method)]
        }, []);

// shuffle https://stackoverflow.com/a/12646864
for (let i = shuffledMethods.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const [methodJ, methodI] = [shuffledMethods[j], shuffledMethods[i]];
    if (methodJ && methodI) {
        [shuffledMethods[i], shuffledMethods[j]] = [methodJ, methodI];
    }
}

async function fetchStateWithMethod(method: MemberFetchMethod) {
    switch (method) {
        case MemberFetchMethod.JoinedMembers:
            return await client.getJoinedRoomMembers(roomId);
        case MemberFetchMethod.Members:
            return await client.getRoomMembers(roomId, undefined, undefined, ['leave', 'ban']);
        case MemberFetchMethod.State:
            return await client.getRoomState(roomId);
        default:
            throw new TypeError();
    }
}

const times = new Map<MemberFetchMethod, number[]>([
    [MemberFetchMethod.JoinedMembers, []],
    [MemberFetchMethod.Members, []],
    [MemberFetchMethod.State, []]
]);

function addTime(method: MemberFetchMethod, time: number) {
    const entry = times.get(method);
    if (entry === undefined) {
        throw new TypeError()
    }
    entry.push(time);
}

function getTimes(method: MemberFetchMethod) {
    return times.get(method);
}

function evenMedian(s: number[], mid: number): number | undefined {
    const leftMid = s[mid - 1];
    const rightMid = s[mid];
    if (leftMid === undefined || rightMid === undefined) {
        throw new TypeError(`Code is wrong bozo`)
    }
    return ((leftMid + rightMid) / 2);
}

// https://stackoverflow.com/a/70806192
function calculateMedian (arr: number[]): number | undefined {
    if (!arr.length) return undefined;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? evenMedian(s, mid) : s[mid];
};

void (async () => {
    for (const method of shuffledMethods) {
        const start = Date.now();
        await fetchStateWithMethod(method);
        const elapsedMs = Date.now() - start;
        addTime(method, elapsedMs);
    }

    for (const method of [MemberFetchMethod.JoinedMembers, MemberFetchMethod.Members, MemberFetchMethod.State]) {
        const nextTimes = getTimes(method);
        if (nextTimes === undefined) {
            throw new TypeError(`Times shouldn't be undefined matey`);
        }
        const sum = nextTimes.reduce((a, b) => a + b, 0);
        const mean = (sum / nextTimes.length) || 0;
        const median = calculateMedian(nextTimes);
        console.log(`${method}: total time elapsed ${sum / 1000}seconds, mean time ${mean}ms, median time ${median}ms`);
    }
})();
