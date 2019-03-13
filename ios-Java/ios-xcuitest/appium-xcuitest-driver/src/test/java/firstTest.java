import io.appium.java_client.ios.IOSDriver;
import io.appium.java_client.remote.MobileCapabilityType;
import io.appium.java_client.remote.MobilePlatform;
import org.openqa.selenium.remote.DesiredCapabilities;


//public class DeviceSetup extends BaseTest {
public class firstTest extends BaseTest {


	   static AppiumDriver prepareDevice() throws MalformedURLException {
	        File appDir = new File("/Users/sparsoya/Library/Developer/Xcode/DerivedData/UICatalog-fkqxsesfypbzqecbjrtkgjltutji/Build/Products/Debug-iphonesimulator/");
	        File app = new File(appDir, "UICatalog.app");
	        DesiredCapabilities capabilities = new DesiredCapabilities();
	        capabilities.setCapability(MobileCapabilityType.DEVICENAME, "iPhone 7");
	        capabilities.setCapability(MobileCapabilityType.PLATFORM_VERSION, "12.1");
	        capabilities.setCapability(MobileCapabilityType.PLATFORM_NAME, MobilePlatform.IOS);
	        capabilities.setCapability(MobileCapabilityType.PLATFORM, "MAC");
	        //capabilities.setCapability(MobileCapabilityType.DEVICE_NAME,"ahmet");
	        //capabilities.setCapability("udid","82e1c906c4d00c16b24198035f0c2035d3d78ddf");
	        capabilities.setCapability(MobileCapabilityType.AUTOMATION_NAME, "XCUITest");
	        capabilities.setCapability("appium-version", "1.10.1");
	        capabilities.setCapability("autoAcceptAlerts",false);
	        capabilities.setCapability("noReset","true");
	        capabilities.setCapability(MobileCapabilityType.APP, app.getAbsolutePath());
	        capabilities.setCapability(MobileCapabilityType.NEW_COMMAND_TIMEOUT, 30000);
	        driver = new IOSDriver(new URL("http://127.0.0.1:4723/wd/hub"), capabilities);
	        driver.manage().timeouts().implicitlyWait(15, TimeUnit.SECONDS);
	        return driver;
	   }
}