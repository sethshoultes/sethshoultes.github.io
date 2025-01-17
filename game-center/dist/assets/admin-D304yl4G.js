var u=n=>{throw TypeError(n)};var g=(n,t,e)=>t.has(n)||u("Cannot "+e);var a=(n,t,e)=>(g(n,t,"read from private field"),e?e.call(n):t.get(n)),h=(n,t,e)=>t.has(n)?u("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(n):t.set(n,e),p=(n,t,e,s)=>(g(n,t,"write to private field"),s?s.call(n,e):t.set(n,e),e);import{c as v}from"./index-DZohDlus.js";var o;class b{constructor(){h(this,o);p(this,o,v("https://bmrpsqvaskcrrlfppdcj.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtcnBzcXZhc2tjcnJsZnBwZGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY5MTkwMzgsImV4cCI6MjA1MjQ5NTAzOH0.E06P6lpj-Fybt6gFIm0u3JetzgQ8CHmts_QLl4YjmOE"))}async signIn(t,e){console.log("Attempting to sign in with email:",t);const{data:s,error:r}=await a(this,o).auth.signInWithPassword({email:t,password:e});if(r)throw console.error("Sign in error:",r),r;return console.log("Sign in successful:",s),s}async signOut(){const{error:t}=await a(this,o).auth.signOut();if(t)throw t}async getCurrentUser(){console.log("Getting current user");const{data:{user:t},error:e}=await a(this,o).auth.getUser();if(e)throw console.error("Get user error:",e),e;return console.log("Current user:",t),t}async getGames(){const{data:t,error:e}=await a(this,o).from("games").select("*").order("name");if(e)throw e;return t}async getGameSettings(t){console.log("Getting game settings for slug:",t);const{data:e,error:s}=await a(this,o).from("game_settings").select(`
        *,
        games!inner(*)
      `).eq("games.slug",t);if(s)throw console.error("Supabase error getting game settings:",s),s;return console.log("Game settings data:",e),e}async updateGameSettings(t,e){for(const[s,r]of Object.entries(e)){const{error:i}=await a(this,o).from("game_settings").update({value:JSON.stringify(r)}).eq("game_id",t).eq("key",s);if(i)throw i}}}o=new WeakMap;class w{constructor(){this.gameCenter=new b,this.user=null,this.currentGame=null,this.settings={},this.init()}async init(){try{this.user=await this.gameCenter.getCurrentUser(),this.user?this.showAdminPanel():this.showLoginForm()}catch(t){console.error("Error checking auth status:",t),this.showLoginForm()}}showLoginForm(){const t=document.getElementById("adminContainer");t.innerHTML=`
      <div class="max-w-md mx-auto mt-8 bg-white p-8 rounded-lg shadow">
        <h2 class="text-2xl font-bold mb-6">Admin Login</h2>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">Email</label>
            <input type="email" id="email" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" id="password" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          </div>
          <button type="submit" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Sign In
          </button>
        </form>
      </div>
    `,document.getElementById("loginForm").addEventListener("submit",async e=>{e.preventDefault();const s=document.getElementById("email").value,r=document.getElementById("password").value;try{await this.gameCenter.signIn(s,r),this.user=await this.gameCenter.getCurrentUser(),this.showAdminPanel()}catch(i){console.error("Login error:",i),alert("Login failed: "+i.message)}})}showAdminPanel(){const t=document.getElementById("adminContainer");t.innerHTML=`
      <nav class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <div class="flex">
              <div class="flex-shrink-0 flex items-center">
                <h1 class="text-xl font-bold text-gray-900">Game Center Admin</h1>
              </div>
            </div>
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-4">${this.user.email}</span>
              <button id="signOutButton" class="text-sm text-gray-500 hover:text-gray-700">Sign Out</button>
            </div>
          </div>
        </div>
      </nav>

      <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div class="px-4 sm:px-0">
          <select id="gameSelect" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            <option value="">Select a game...</option>
          </select>
        </div>

        <div id="settingsForm" class="hidden mt-6 bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
          <div class="md:grid md:grid-cols-3 md:gap-6">
            <div class="md:col-span-1">
              <h3 class="text-lg font-medium leading-6 text-gray-900">Game Settings</h3>
              <p class="mt-1 text-sm text-gray-500">
                Customize the game parameters and appearance.
              </p>
            </div>
            <div class="mt-5 md:mt-0 md:col-span-2">
              <div class="grid grid-cols-6 gap-6" id="settingsContainer">
              </div>
            </div>
          </div>
          <div class="mt-5 flex justify-end">
            <button type="button" id="saveButton" class="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    `,this.setupEventListeners(),this.loadGames()}async setupEventListeners(){document.getElementById("gameSelect").addEventListener("change",t=>{this.loadGameSettings(t.target.value)}),document.getElementById("saveButton").addEventListener("click",()=>{this.saveSettings()}),document.getElementById("signOutButton").addEventListener("click",async()=>{try{await this.gameCenter.signOut(),this.user=null,this.showLoginForm()}catch(t){console.error("Sign out error:",t),alert("Failed to sign out")}})}async loadGames(){try{const t=await this.gameCenter.getGames(),e=document.getElementById("gameSelect");t.forEach(s=>{const r=document.createElement("option");r.value=s.slug,r.textContent=s.name,e.appendChild(r)})}catch(t){console.error("Error loading games:",t),alert("Failed to load games")}}async loadGameSettings(t){var e;if(!t){document.getElementById("settingsForm").classList.add("hidden");return}try{const s=await this.gameCenter.getGameSettings(t);this.currentGame=(e=s[0])==null?void 0:e.games,this.renderSettings(s),document.getElementById("settingsForm").classList.remove("hidden")}catch(s){console.error("Error loading settings:",s),alert("Failed to load game settings")}}renderSettings(t){const e=document.getElementById("settingsContainer");e.innerHTML="",t.forEach(s=>{const{key:r,value:i,description:f}=s,y=JSON.parse(typeof i=="string"?i:JSON.stringify(i)),d=document.createElement("div");d.className="col-span-6 sm:col-span-3";const l=document.createElement("label");l.className="block text-sm font-medium text-gray-700",l.textContent=r;const m=this.createInput(y);m.id=r;const c=document.createElement("p");c.className="mt-1 text-sm text-gray-500",c.textContent=f,d.appendChild(l),d.appendChild(m),d.appendChild(c),e.appendChild(d)})}createInput(t){let e;switch(t.type){case"color":e=document.createElement("input"),e.type="color",e.value=t.value,e.className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm";break;case"number":e=document.createElement("input"),e.type="number",e.value=t.value,e.min=t.min,e.max=t.max,e.step=t.step||1,e.className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm";break;default:e=document.createElement("input"),e.type="text",e.value=t.value,e.className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"}return e}async saveSettings(){if(!this.currentGame)return;const t={};document.querySelectorAll("#settingsContainer input").forEach(e=>{t[e.id]={type:e.type==="number"?"number":"color",value:e.type==="number"?parseFloat(e.value):e.value}});try{await this.gameCenter.updateGameSettings(this.currentGame.id,t),alert("Settings saved successfully!")}catch(e){console.error("Error saving settings:",e),alert("Failed to save settings")}}}new w;
