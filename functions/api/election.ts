import {createElectionHandler} from "../../server/election-feed";

// One handler per isolate, so its short memo is shared by every request the isolate serves.
const handle=createElectionHandler();

export const onRequest=({request}:{request:Request})=>handle(request);
