# small-sounds
Small Sounds is a kind of site like Spotify, but inspired by the customizability of Github profiles, and it is made for musical instruments covers for popular and less popular songs.

## Running locally
- To run locally, clone the project, go in the ```server``` directory, make sure you have node installed. Run ```npm i``` to download the necesarry dependencies, and run ```npm run dev``` to start the website on localhost:3000.
- Make sure to delete the ```server.db``` file and create it again, after that open the file with```sqlite3 server.db``` and paste everything that is in ```/src/querries.sql```. To clear the database and to create the tables again. 
