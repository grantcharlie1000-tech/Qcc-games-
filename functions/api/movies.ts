import {handleMoviesCatalog} from "../../server/movies-catalog";

type Env={TMDB_READ_TOKEN?:string};

export const onRequest=({request,env}:{request:Request;env:Env})=>
 handleMoviesCatalog(request,env.TMDB_READ_TOKEN??"");
