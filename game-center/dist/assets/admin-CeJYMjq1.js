import{G as c}from"./GameCenter-BgCRq8P2.js";class u{constructor(){this.gameCenter=new c,this.user=null,this.currentGame=null,this.settings={},this.init()}async init(){try{this.user=await this.gameCenter.getCurrentUser(),this.user?this.showAdminPanel():this.showLoginForm()}catch(t){console.error("Error checking auth status:",t),this.showLoginForm()}}showLoginForm(){const t=document.getElementById("adminContainer");t.innerHTML=`
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
    `,document.getElementById("loginForm").addEventListener("submit",async e=>{e.preventDefault();const s=document.getElementById("email").value,n=document.getElementById("password").value;try{await this.gameCenter.signIn(s,n),this.user=await this.gameCenter.getCurrentUser(),this.showAdminPanel()}catch(i){console.error("Login error:",i),alert("Login failed: "+i.message)}})}showAdminPanel(){const t=document.getElementById("adminContainer");t.innerHTML=`
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
    `,this.setupEventListeners(),this.loadGames()}async setupEventListeners(){document.getElementById("gameSelect").addEventListener("change",t=>{this.loadGameSettings(t.target.value)}),document.getElementById("saveButton").addEventListener("click",()=>{this.saveSettings()}),document.getElementById("signOutButton").addEventListener("click",async()=>{try{await this.gameCenter.signOut(),this.user=null,this.showLoginForm()}catch(t){console.error("Sign out error:",t),alert("Failed to sign out")}})}async loadGames(){try{const t=await this.gameCenter.getGames(),e=document.getElementById("gameSelect");t.forEach(s=>{const n=document.createElement("option");n.value=s.slug,n.textContent=s.name,e.appendChild(n)})}catch(t){console.error("Error loading games:",t),alert("Failed to load games")}}async loadGameSettings(t){var e;if(!t){document.getElementById("settingsForm").classList.add("hidden");return}try{const s=await this.gameCenter.getGameSettings(t);this.currentGame=(e=s[0])==null?void 0:e.games,this.renderSettings(s),document.getElementById("settingsForm").classList.remove("hidden")}catch(s){console.error("Error loading settings:",s),alert("Failed to load game settings")}}renderSettings(t){const e=document.getElementById("settingsContainer");e.innerHTML="",t.forEach(s=>{const{key:n,value:i,description:l}=s,m=JSON.parse(typeof i=="string"?i:JSON.stringify(i)),o=document.createElement("div");o.className="col-span-6 sm:col-span-3";const a=document.createElement("label");a.className="block text-sm font-medium text-gray-700",a.textContent=n;const d=this.createInput(m);d.id=n;const r=document.createElement("p");r.className="mt-1 text-sm text-gray-500",r.textContent=l,o.appendChild(a),o.appendChild(d),o.appendChild(r),e.appendChild(o)})}createInput(t){let e;switch(t.type){case"color":e=document.createElement("input"),e.type="color",e.value=t.value,e.className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm";break;case"number":e=document.createElement("input"),e.type="number",e.value=t.value,e.min=t.min,e.max=t.max,e.step=t.step||1,e.className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm";break;default:e=document.createElement("input"),e.type="text",e.value=t.value,e.className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"}return e}async saveSettings(){if(!this.currentGame)return;const t={};document.querySelectorAll("#settingsContainer input").forEach(e=>{t[e.id]={type:e.type==="number"?"number":"color",value:e.type==="number"?parseFloat(e.value):e.value}});try{await this.gameCenter.updateGameSettings(this.currentGame.id,t),alert("Settings saved successfully!")}catch(e){console.error("Error saving settings:",e),alert("Failed to save settings")}}}new u;
