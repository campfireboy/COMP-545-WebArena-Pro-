## WebArena-Pro Mydrive ReadMe

This Project is a DropBox Like website built for the WebArena Pro website suite.

This website is built on the following framework with:
- A Min.io s3 file storage server
- A Postgres database used for user tracking, file sharing and ownership tracking
- A Websockets server for live multi user text editing

This website is equiped with the the following features:
- An interactive mp4 video player, an mp3 audio player, and an image viewer for image files
- Download and upload capability for all file types
- A live mulit user text editor
- File sharing between multiple users

How to setup and use:

## Setup Instructions

1. Pull the image with this command:
   ```bash
   docker pull miller3456/mydrive:latest
   ```

2. To run the docker image run this command:
   ```bash
   docker run miller3456/mydrive:latest
   ```

3. Once set up: go to  
   `localhost:7860`  
   to sign in.

4. There are 2 users pre-set up on this website named Agent 1 and Agent 2:

   a. **Agent 1**  
      - Email: agent1@test.com  
      - Password: password  

   b. **Agent 2**  
      - Email: agent2@test.com  
      - Password: password  

   c. Usernames are only important for file sharing:
      - Agent 1 username: `agent1`  
      - Agent 2 username: `agent2`

5. To test agent behavior without signing in, you can use:

   - `localhost:7860/agent1skiplogin`
   - `localhost:7860/agent2skiplogin`
6. After intereacting with the website run this command to reset the database and servers back to their original state:
   ```bash
   curl -X POST http://localhost:3000/api/dev/reset
   ``` 

