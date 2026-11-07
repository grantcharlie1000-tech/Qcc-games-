import {handleMoviePopularity, type PopularityEnv} from '../../server/movie-popularity';

// Only deploy behind Pages, which supplies the trusted CF-Connecting-IP header.
export const onRequest=({request,env}:{request:Request;env:PopularityEnv})=>handleMoviePopularity(request,env);
