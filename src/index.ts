import express from 'express';
import { LocalStorage } from 'node-localstorage'
import SpotifyWebApi from 'spotify-web-api-node';
import si from 'systeminformation';
import pb from 'pretty-bytes';

const localStorage = new LocalStorage('./scratch');
const app = express();
const port = 3000;

const client_id = '1393f6c111904ed8b24fdae7e2e7b863'; // Your client id
const client_secret = '1a75e2a842274f3f915c96cc6fd03f46'; // Your secret
const redirect_uri = `http://localhost:${port}/callback/`;
const scope = "user-read-currently-playing user-read-playback-state user-modify-playback-state user-library-read user-library-modify";

// credentials are optional
var spotifyApi = new SpotifyWebApi({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUri: redirect_uri
});

app.get('/', function (req, res) {
    
    
    res.redirect('https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
        }).toString()
    )
});

app.get('/callback', function (req, res) {

    if (req.query['code']) {
        localStorage.setItem('code', req.query['code']);
    }

    let code = localStorage.getItem('code');
    console.log('code: ', code);

    spotifyApi.authorizationCodeGrant(code)
        .then(function (data) {
            // Set the access token on the API object to use it in later calls
            const access_token = data.body['access_token'];
            localStorage.setItem('access_token', access_token);
            spotifyApi.setAccessToken(access_token);
            spotifyApi.setRefreshToken(data.body['refresh_token']);
            res.redirect('/nowplaying');
        }, function (err) {
            res.redirect('/');
            console.log('Something went wrong!', err.body);
        });
}
);

let currentPlaying: CurrentPlaying = {
    id: '',
    song: '',
    artist: '',
    isInLib: false
};

app.get('/nowplaying', (req, res) => {
    spotifyApi.setAccessToken(localStorage.getItem('access_token'));
    spotifyApi.getMyCurrentPlayingTrack().then(data => {
        
        if (data.body.item) {

            spotifyApi.containsMySavedTracks([data.body.item?.id])
                .then((data) => {
                    currentPlaying.isInLib = data.body[0];
                });

            currentPlaying.id = data.body.item.id;
            currentPlaying.song = data.body.item.name;
            currentPlaying.artist = data.body.item.artists.map(x => x.name).join();
        }

        res.send(JSON.stringify(currentPlaying));
    }, error => {
        //res.send(error.body.error);
        if (error.body.error.status === 401) {
            res.redirect('/callback');
        } else {
            res.send(error.body.error);
        }
    })
});

app.get('/like-toggle', (req, res) => {
    spotifyApi.setAccessToken(localStorage.getItem('access_token'));
    // Remove tracks from the signed in user's Your Music library
    if (currentPlaying.id) {
        spotifyApi.containsMySavedTracks([currentPlaying.id])
            .then((data) => {
                currentPlaying.isInLib = data.body[0];

                if (currentPlaying.isInLib) {
                    spotifyApi.removeFromMySavedTracks([currentPlaying.id])
                    res.send('Removed from lib');
                } else {
                    spotifyApi.addToMySavedTracks([currentPlaying.id])
                    res.send('Added to lib');
                }
            });
    } else {
        res.send('no id playing');
    }
});

app.get('/pb-toggle', (req, res) => {
    spotifyApi.getMyCurrentPlaybackState()
        .then((data) => {
            // Output items
            if (data.body && data.body.is_playing) {
                console.log("User is currently playing something!");
                spotifyApi.pause().then(()=> res.send('Paused'), (err)=> res.send(err));
            } else {
                console.log("User is not playing anything, or doing so in private.");
                spotifyApi.play().then(()=> res.send('Played'), (err)=> res.send(err));
                
            }
        }, (err) => {
            console.error ('pberror:', err);
            res.redirect('/callback');
        });
});

let monitor: Monitor = { cpuPercent: 0, cpuTemp: 0, memUsed: '', memTotal: '' }

app.get('/hwinfo', (req, res) => {
    res.send(JSON.stringify(monitor));
})

setInterval(() => {
    si.currentLoad().then(data => {
        monitor.cpuPercent = data.currentLoad;
    });

    si.cpuTemperature().then(data => {
        monitor.cpuTemp = data.max;
    })

    si.mem().then(data => {
        monitor.memUsed = pb(data.available);
        monitor.memTotal = pb(data.total);
    });

    si.graphics().then(data => {

    });
}, 500);

app.listen(port, () => {
    return console.log(`Express is listening at http://localhost:${port}`);
});

interface CurrentPlaying {
    id: string | null,
    song: string | null,
    artist: string | null,
    isInLib: boolean | null
}

interface Monitor {
    cpuPercent: number,
    cpuTemp: number,
    memUsed: string,
    memTotal: string
}