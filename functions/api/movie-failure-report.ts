import {handleMovieFailureReport,type MovieFailureEnv} from '../../server/movie-failure-report';

export const onRequest=({request,env}:{request:Request;env:MovieFailureEnv})=>
 handleMovieFailureReport(request,env);
