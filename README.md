## Setup Instructions

1. Pull the image with this command:
   ```bash
   docker pull miller3456/mydrive:latest
   ```

2. To run the docker image run this command:
   ```bash
   docker run -p 7860:7860 miller3456/mydrive:latest
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
