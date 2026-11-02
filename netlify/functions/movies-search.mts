import type {Config} from "@netlify/functions";

import {handleMoviesCatalog} from "../../server/movies-catalog";

export {handleMoviesCatalog} from "../../server/movies-catalog";

export default async (req:Request)=>handleMoviesCatalog(req,Netlify.env.get("TMDB_READ_TOKEN")??"");
export const config:Config={path:"/api/movies",method:["GET"]};
